#!/usr/bin/env node
/**
 * Post-failure diagnosis for deploy-prod workflow.
 * Reads classification artifact + GitHub run logs (when token available).
 */
import fs from 'node:fs';

const runId = process.env.GITHUB_RUN_ID;
const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const webhook = process.env.DEPLOY_ALERT_WEBHOOK || '';

let classification = null;
if (fs.existsSync('deploy-failure-classification.json')) {
  classification = JSON.parse(fs.readFileSync('deploy-failure-classification.json', 'utf8'));
}

const lines = [];
lines.push('# Deploy failure diagnosis');
lines.push('');
lines.push(`- Run: ${repo} #${runId}`);
lines.push(`- Workflow: Deploy Firebase Hosting Production`);
lines.push(`- SHA: ${process.env.GITHUB_SHA || 'unknown'}`);
lines.push('');

if (classification) {
  lines.push('## Classification');
  lines.push(`- Category: **${classification.category}**`);
  lines.push(`- Transient: ${classification.transient ? 'yes (auto-retry may apply)' : 'no'}`);
  lines.push(`- Message: ${classification.message}`);
  lines.push(`- Next steps: ${classification.nextSteps}`);
} else {
  lines.push('## Classification');
  lines.push('- No local classification file — inferred from GitHub job API below.');
}

async function fetchFailedSteps() {
  if (!token || !repo || !runId) return [];
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
  };
  const jobsRes = await fetch(`https://api.github.com/repos/${repo}/actions/runs/${runId}/jobs`, {
    headers,
  });
  if (!jobsRes.ok) return [];
  const jobs = await jobsRes.json();
  const snippets = [];
  for (const job of jobs.jobs || []) {
    if (job.conclusion !== 'failure') continue;
    for (const step of job.steps || []) {
      if (step.conclusion !== 'failure') continue;
      snippets.push({
        job: job.name,
        step: step.name,
        number: step.number,
        exitCode: 1,
      });
    }
  }
  return snippets;
}

async function fetchJobLogSnippet() {
  if (!token || !repo || !runId) return '';
  try {
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
    const jobsRes = await fetch(`https://api.github.com/repos/${repo}/actions/runs/${runId}/jobs`, {
      headers,
    });
    if (!jobsRes.ok) return '';
    const { jobs } = await jobsRes.json();
    const failedJob = (jobs || []).find((j) => j.conclusion === 'failure');
    if (!failedJob?.id) return '';
    const logRes = await fetch(
      `https://api.github.com/repos/${repo}/actions/jobs/${failedJob.id}/logs`,
      { headers, redirect: 'follow' }
    );
    if (!logRes.ok) return '';
    const text = await logRes.text();
    const errLines = text
      .split('\n')
      .filter(
        (l) =>
          /##\[error\]|ERROR:|Permission denied|PERMISSION_DENIED|exit code|failed with/i.test(l)
      )
      .slice(-15);
    return errLines.join('\n');
  } catch {
    return '';
  }
}

const failedSteps = await fetchFailedSteps();
if (failedSteps.length) {
  lines.push('');
  lines.push('## Failed steps');
  for (const s of failedSteps) {
    lines.push(`- Job \`${s.job}\` → step \`${s.step}\` (#${s.number}, exit ${s.exitCode})`);
  }
}

const logSnippet = await fetchJobLogSnippet();
if (logSnippet) {
  lines.push('');
  lines.push('## Error log excerpt');
  lines.push('```');
  lines.push(logSnippet.slice(0, 4000));
  lines.push('```');
}

if (!classification && failedSteps.some((s) => /cloud sdk|authenticate|google cloud/i.test(s.step))) {
  lines.push('');
  lines.push('## Likely root cause (OIDC)');
  lines.push(
    '- **IAM / OIDC:** `iam.serviceAccounts.getAccessToken` denied during `setup-gcloud`.'
  );
  lines.push(
    '- **Fix:** Re-run `scripts/setup-workload-identity.ps1 -SetGitHubSecrets` and ensure deploy uses `setup-gcloud` with `skip_auth: true`.'
  );
}

lines.push('');
lines.push(`Open logs: https://github.com/${repo}/actions/runs/${runId}`);

if (fs.existsSync('deploy-rollback-result.json')) {
  const rollback = JSON.parse(fs.readFileSync('deploy-rollback-result.json', 'utf8'));
  lines.push('');
  lines.push('## Rollback');
  lines.push(
    rollback.rolledBack
      ? `- **Success:** live restored from \`${rollback.fromChannel}\``
      : `- **Skipped/failed:** ${rollback.reason || rollback.error || 'see rollback log'}`
  );
}

const report = lines.join('\n');
console.log(report);
fs.writeFileSync('deploy-diagnosis.md', report);

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
}

if (webhook) {
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `Resumora deploy FAILED — run ${runId}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Deploy failed* for \`${repo}\`\nRun: <https://github.com/${repo}/actions/runs/${runId}|#${runId}>\n${classification?.message || failedSteps[0]?.step || 'See Actions logs'}`,
            },
          },
        ],
      }),
    });
    console.log('Alert webhook: Success');
  } catch (e) {
    console.warn(`Alert webhook: Failure (${e.message})`);
  }
}

console.log('diagnose-failure: complete');
