/**
 * BossMind System Manual ΓÇö auto-generated operational documentation.
 * Aggregates Firestore telemetry; optional Google AI summary. Never logs secrets.
 */
const { FieldValue } = require('firebase-admin/firestore');

const MANUAL_COL = 'system_manual';
const MANUAL_DOC = 'current';
const HEALTH_COL = 'system_health';
const HEALTH_DOC = 'current';
const INCIDENTS_COL = 'system_incidents';
const REMEDIATIONS_COL = 'system_remediations';
const PUBLISH_JOBS_COL = 'media_publish_jobs';

const SENSITIVE_RE =
  /\b(sk_live_[A-Za-z0-9]+|sk_test_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+|pk_live_[A-Za-z0-9]+|price_[A-Za-z0-9]+|BILIBILI_[A-Z_]+)\b/gi;

const DISCLAIMER =
  '> **Auto-generated.** This manual is produced by BossMind documentation automation. ' +
  'Verify critical changes against GitHub Actions and admin approvals before acting. ' +
  'Secret values are never stored or displayed.';

function redactText(value) {
  return String(value ?? '').replace(SENSITIVE_RE, '[REDACTED]');
}

function redactObject(input, depth = 0) {
  if (depth > 6) return '[truncated]';
  if (input == null) return input;
  if (typeof input === 'string') return redactText(input);
  if (typeof input !== 'object') return input;
  if (Array.isArray(input)) return input.slice(0, 25).map((v) => redactObject(v, depth + 1));
  const out = {};
  for (const [key, val] of Object.entries(input)) {
    if (/secret|password|token|sessdata|api_key/i.test(key)) {
      out[key] = '[REDACTED]';
      continue;
    }
    out[key] = redactObject(val, depth + 1);
  }
  return out;
}

function serializeDoc(doc) {
  const d = doc.data() || {};
  const out = { id: doc.id, ...d };
  for (const key of Object.keys(out)) {
    if (out[key] && typeof out[key].toDate === 'function') {
      out[key] = out[key].toDate().toISOString();
    }
  }
  return redactObject(out);
}

async function safeQuery(db, col, limit = 15, orderField = 'createdAt') {
  try {
    const snap = await db.collection(col).orderBy(orderField, 'desc').limit(limit).get();
    return snap.docs.map(serializeDoc);
  } catch (_) {
    try {
      const snap = await db.collection(col).limit(limit).get();
      return snap.docs.map(serializeDoc);
    } catch {
      return [];
    }
  }
}

async function gatherContext(db) {
  const healthSnap = await db.collection(HEALTH_COL).doc(HEALTH_DOC).get();
  const healthRaw = healthSnap.exists ? serializeDoc(healthSnap) : null;
  const health = healthRaw
    ? {
        score: healthRaw.score,
        status: healthRaw.status,
        cycleId: healthRaw.cycleId,
        updatedAt: healthRaw.updatedAt,
        activeRemediations: healthRaw.activeRemediations || [],
      }
    : null;

  const [incidents, remediations, publishJobs] = await Promise.all([
    safeQuery(db, INCIDENTS_COL, 12),
    safeQuery(db, REMEDIATIONS_COL, 12),
    safeQuery(db, PUBLISH_JOBS_COL, 12),
  ]);

  const successfulRemediations = remediations.filter((r) =>
    ['remediated', 'approved_awaiting_ops', 'completed'].includes(String(r.status || ''))
  );
  const failedPublishJobs = publishJobs.filter((j) =>
    ['failed', 'partial'].includes(String(j.status || ''))
  );
  const humanReviewIncidents = incidents.filter((i) => Boolean(i.requiresHumanReview));

  return {
    generatedAt: new Date().toISOString(),
    health,
    incidents: incidents.slice(0, 8),
    humanReviewIncidents: humanReviewIncidents.slice(0, 8),
    successfulRemediations: successfulRemediations.slice(0, 8),
    publishJobs: publishJobs.slice(0, 8),
    failedPublishJobs: failedPublishJobs.slice(0, 8),
    counts: {
      incidents: incidents.length,
      humanReviewIncidents: humanReviewIncidents.length,
      successfulRemediations: successfulRemediations.length,
      publishJobs: publishJobs.length,
      failedPublishJobs: failedPublishJobs.length,
    },
  };
}

function buildRuleBasedSummary(context) {
  const h = context.health;
  const score = h?.score != null ? h.score : 'unknown';
  const status = h?.status || 'unknown';
  const lines = [
    `System health score is ${score} (${status}).`,
    `${context.counts.humanReviewIncidents} incident(s) require human review.`,
    `${context.counts.successfulRemediations} recent remediation(s) succeeded or await ops.`,
    `${context.counts.failedPublishJobs} media publish job(s) need attention.`,
  ];
  return lines.join(' ');
}

async function generateAiSummary(context) {
  try {
    const { callGeminiChat, geminiApiKeyConfigured } = require('./lib/geminiChat');
    if (!geminiApiKeyConfigured()) return buildRuleBasedSummary(context);
    const prompt = [
      'You are a Site Reliability Engineer writing a concise BossMind operations summary.',
      'Use only the JSON facts below. Never invent secrets, API keys, or price IDs.',
      'Write 3-5 sentences: current status, recent incidents/remediations, publish pipeline, recommended admin actions.',
      'JSON:',
      JSON.stringify(context, null, 2),
    ].join('\n');
    const { text } = await callGeminiChat({ prompt, lang: 'en', timeoutMs: 25000 });
    if (!text) return buildRuleBasedSummary(context);
    return redactText(String(text).trim());
  } catch {
    return buildRuleBasedSummary(context);
  }
}

function buildMarkdown({ context, aiSummary, meta = {} }) {
  const h = context.health;
  const now = context.generatedAt;
  return [
    '# BossMind System Manual ΓÇö Resumora',
    '',
    DISCLAIMER,
    '',
    `**Last updated:** ${now}`,
    meta.trigger ? `**Trigger:** ${redactText(meta.trigger)}` : '',
    '',
    '## Current Status',
    '',
    aiSummary,
    '',
    '| Metric | Value |',
    '|--------|-------|',
    `| Health score | ${h?.score ?? 'ΓÇö'} |`,
    `| Health status | ${h?.status ?? 'ΓÇö'} |`,
    `| Last health cycle | ${h?.cycleId ?? 'ΓÇö'} |`,
    `| Open incidents (sample) | ${context.counts.incidents} |`,
    `| Human review required | ${context.counts.humanReviewIncidents} |`,
    `| Successful remediations | ${context.counts.successfulRemediations} |`,
    `| Failed/partial publish jobs | ${context.counts.failedPublishJobs} |`,
    '',
    '## Recent Changes',
    '',
    '### Self-heal incidents',
    ...(context.incidents.length
      ? context.incidents.map(
          (i) =>
            `- ${i.createdAt || 'ΓÇö'} ΓÇö score ${i.score ?? 'ΓÇö'} ΓÇö ${i.status || 'ΓÇö'}${
              i.requiresHumanReview ? ' (human review)' : ''
            }`
        )
      : ['- No recent incidents recorded.']),
    '',
    '### Remediations',
    ...(context.successfulRemediations.length
      ? context.successfulRemediations.map(
          (r) => `- ${r.createdAt || 'ΓÇö'} ΓÇö ${r.actionId || r.id} ΓÇö ${r.status || 'ΓÇö'}`
        )
      : ['- No recent remediations recorded.']),
    '',
    '### Media publish jobs',
    ...(context.publishJobs.length
      ? context.publishJobs.map(
          (j) =>
            `- ${j.createdAt || 'ΓÇö'} ΓÇö ${j.status || 'ΓÇö'} ΓÇö ${j.platform || j.type || 'job'}`
        )
      : ['- No recent publish jobs recorded.']),
    '',
    '## Documentation pipeline',
    '',
    `- Changelog synced: ${meta.changelogSynced ? 'yes' : 'pending'}`,
    meta.changelogGitSha ? `- Changelog git SHA: \`${meta.changelogGitSha}\`` : '',
    `- Manual document ID: \`${MANUAL_COL}/${MANUAL_DOC}\``,
    '',
    '## Admin actions',
    '',
    '- Review pending HITL approvals: `/admin/system-health`',
    '- Review refund queue: `/admin/refunds`',
    '- Production deploys: GitHub Actions `deploy-prod.yml` (production environment gate)',
    '',
  ]
    .filter(Boolean)
    .join('\n');
}

async function getDocumentationStatus(db) {
  const snap = await db.collection(MANUAL_COL).doc(MANUAL_DOC).get();
  if (!snap.exists) {
    return {
      lastUpdated: null,
      changelogSynced: false,
      changelogGitSha: null,
      trigger: null,
      aiProvider: null,
    };
  }
  const d = serializeDoc(snap);
  return {
    lastUpdated: d.updatedAt || d.generatedAt || null,
    changelogSynced: Boolean(d.changelogSynced),
    changelogGitSha: d.changelogGitSha || null,
    trigger: d.trigger || null,
    aiProvider: d.aiProvider || null,
    summaryPreview: d.aiSummary ? String(d.aiSummary).slice(0, 280) : null,
  };
}

async function updateSystemManual(db, options = {}) {
  const trigger = String(options.trigger || 'manual');
  const changelogGitSha = options.changelogGitSha
    ? String(options.changelogGitSha).slice(0, 40)
    : null;
  const changelogSynced = options.changelogSynced === true || Boolean(changelogGitSha);

  const context = await gatherContext(db);
  const aiSummary = await generateAiSummary(context);
  const aiProvider =
    process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_API_KEY
      ? process.env.VERTEX_AI === 'true' || process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true'
        ? 'vertex-ai'
        : 'google-ai'
      : process.env.VERTEX_AI === 'true' || process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true'
        ? 'vertex-ai'
        : 'rules';

  const markdown = buildMarkdown({
    context,
    aiSummary,
    meta: { trigger, changelogSynced, changelogGitSha },
  });

  const payload = {
    markdown,
    aiSummary,
    aiProvider,
    trigger,
    changelogSynced,
    changelogGitSha,
    generatedAt: context.generatedAt,
    counts: context.counts,
    healthScore: context.health?.score ?? null,
    healthStatus: context.health?.status ?? null,
    updatedAt: FieldValue.serverTimestamp(),
  };

  await db.collection(MANUAL_COL).doc(MANUAL_DOC).set(payload, { merge: true });

  return {
    ok: true,
    updatedAt: context.generatedAt,
    changelogSynced,
    changelogGitSha,
    aiProvider,
    counts: context.counts,
    summaryLength: aiSummary.length,
  };
}

module.exports = {
  gatherContext,
  generateAiSummary,
  buildMarkdown,
  getDocumentationStatus,
  updateSystemManual,
  MANUAL_COL,
  MANUAL_DOC,
  redactText,
};
