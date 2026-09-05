/**
 * GitHub webhook → harness task deploy status.
 * Requires GITHUB_WEBHOOK_SECRET (HMAC). Never logs secret values.
 */
const crypto = require('crypto');
const { updateDeployStatus } = require('./harnessTasks');

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function verifyGitHubSignature(req, secret) {
  const sig = String((req.get && req.get('x-hub-signature-256')) || '');
  if (!sig.startsWith('sha256=') || !secret) return false;
  const raw =
    typeof req.rawBody === 'string' || Buffer.isBuffer(req.rawBody)
      ? req.rawBody
      : Buffer.from(JSON.stringify(req.body || {}), 'utf8');
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return timingSafeEqual(sig, expected);
}

function extractTaskId(payload) {
  const inputs = payload?.inputs || payload?.workflow_run?.inputs || {};
  if (inputs.task_id) return String(inputs.task_id).trim();
  const name = String(payload?.workflow_run?.name || payload?.deployment?.environment || '');
  const m = name.match(/task[_-]?([a-zA-Z0-9_-]+)/i);
  if (m) return m[1];
  const desc = String(
    payload?.deployment?.description || payload?.workflow_run?.display_title || ''
  );
  const m2 = desc.match(/task_id[=:\s]+([a-zA-Z0-9_-]+)/i);
  return m2 ? m2[1] : '';
}

async function handleGitHubWebhook(db, req) {
  const secret = String(process.env.GITHUB_WEBHOOK_SECRET || '').trim();
  if (!secret) {
    const err = new Error('GITHUB_WEBHOOK_SECRET not configured');
    err.statusCode = 503;
    throw err;
  }
  if (!verifyGitHubSignature(req, secret)) {
    const err = new Error('Invalid GitHub signature');
    err.statusCode = 401;
    throw err;
  }

  const event = String((req.get && req.get('x-github-event')) || '');
  const body = req.body || {};
  const taskId = extractTaskId(body);

  if (event === 'ping') {
    return { ok: true, ping: true };
  }

  if (event === 'workflow_run') {
    const action = String(body.action || '');
    const wr = body.workflow_run || {};
    const conclusion = String(wr.conclusion || '');
    const status = String(wr.status || '');
    if (status !== 'completed' && action !== 'completed') {
      return { ok: true, ignored: true, reason: 'not_completed' };
    }
    if (!taskId) {
      return { ok: true, ignored: true, reason: 'no_task_id' };
    }
    const success = conclusion === 'success';
    const task = await updateDeployStatus(db, taskId, {
      success,
      runUrl: wr.html_url || '',
      conclusion,
    });
    return { ok: true, taskId, status: task.status, conclusion };
  }

  if (event === 'deployment_status') {
    if (!taskId) return { ok: true, ignored: true, reason: 'no_task_id' };
    const state = String(body.deployment_status?.state || '');
    if (state !== 'success' && state !== 'failure' && state !== 'error') {
      return { ok: true, ignored: true, reason: 'pending_state' };
    }
    const task = await updateDeployStatus(db, taskId, {
      success: state === 'success',
      runUrl: body.deployment_status?.target_url || body.deployment?.url || '',
      conclusion: state,
    });
    return { ok: true, taskId, status: task.status };
  }

  return { ok: true, ignored: true, reason: `event_${event || 'unknown'}` };
}

module.exports = { handleGitHubWebhook, verifyGitHubSignature, extractTaskId };
