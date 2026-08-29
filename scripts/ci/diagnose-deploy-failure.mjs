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
  lines.push('- No local classification file — check failing step logs in Actions UI.');
  lines.push('- Common causes: OIDC secrets missing, invalid dist/, smoke test failure, IAM.');
}

async function fetchFailedLogs() {
  if (!token || !repo || !runId) return [];
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
  };
  const jobsRes = await fetch(`https://api.github.com/repos/${repo}/actions/runs/${runId}/jobs`, { headers });
  if (!jobsRes.ok) return [];
  const jobs = await jobsRes.json();
  const snippets = [];
  for (const job of jobs.jobs || []) {
    if (job.conclusion !== 'failure') continue;
    for (const step of job.steps || []) {
      if (step.conclusion !== 'failure') continue;
      snippets.push({ job: job.name, step: step.name, number: step.number });
    }
  }
  return snippets;
}

const failedSteps = await fetchFailedLogs();
if (failedSteps.length) {
  lines.push('');
  lines.push('## Failed steps');
  for (const s of failedSteps) {
    lines.push(`- Job \`${s.job}\` → step \`${s.step}\` (#${s.number})`);
  }
  lines.push('');
  lines.push(
    `Open logs: https://github.com/${repo}/actions/runs/${runId}`
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
              text: `*Deploy failed* for \`${repo}\`\nRun: <https://github.com/${repo}/actions/runs/${runId}|#${runId}>\n${classification?.message || 'See Actions logs'}`,
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
