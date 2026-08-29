/**
 * Daily BossMind health report — site, Stripe config, tests (no secrets).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import dotenv from 'dotenv';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
dotenv.config({ path: path.join(root, '.env'), quiet: true });
dotenv.config({ path: path.join(root, '.env.local'), quiet: true });

async function probe(url) {
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(15000) });
    return { url, status: res.status, ok: res.ok };
  } catch (err) {
    return { url, status: 0, ok: false, error: err.message };
  }
}

const checks = {
  timestamp: new Date().toISOString(),
  project: 'bossmind-resumora',
  domain: 'resumora.net',
  probes: await Promise.all([
    probe('https://resumora.net'),
    probe('https://resumora.net/pricing'),
    probe('https://resumora.net/api/webhook'),
  ]),
  environment: {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ? 'SET' : 'MISSING',
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ? 'SET' : 'MISSING',
    RESEND_API_KEY: process.env.RESEND_API_KEY ? 'SET' : 'MISSING',
    FIREBASE_SERVICE_ACCOUNT: process.env.FIREBASE_SERVICE_ACCOUNT ? 'SET' : 'MISSING',
  },
  git: {},
  tests: {},
};

try {
  checks.git.branch = execSync('git branch --show-current', { cwd: root, encoding: 'utf8' }).trim();
  checks.git.sha = execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf8' }).trim();
} catch (_) {
  /* optional */
}

try {
  execSync('npm run test:billing', { cwd: root, stdio: 'pipe' });
  checks.tests.billing = 'pass';
} catch {
  checks.tests.billing = 'fail';
}

checks.overall = checks.probes.every((p) => p.ok || p.url.includes('/api/webhook'))
  ? checks.tests.billing === 'pass'
    ? 'healthy'
    : 'degraded'
  : 'unhealthy';

const outJson = path.join(root, 'docs', 'daily-health-report.json');
const outMd = path.join(root, 'docs', 'daily-health-report.md');
fs.mkdirSync(path.dirname(outJson), { recursive: true });
fs.writeFileSync(outJson, JSON.stringify(checks, null, 2));

const md = `# Daily Health Report — ${checks.timestamp}

- **Overall:** ${checks.overall}
- **Branch:** ${checks.git.branch || 'unknown'} @ ${checks.git.sha || 'unknown'}
- **Site probe:** ${checks.probes.map((p) => `${p.url} → ${p.status}`).join(' · ')}
- **Billing tests:** ${checks.tests.billing}
- **Missing env:** ${Object.entries(checks.environment).filter(([, v]) => v === 'MISSING').map(([k]) => k).join(', ') || 'none'}

## AI improvement suggestions
- Deploy \`stripeWebhook\` if /api/webhook returns HTML
- Set \`FIREBASE_SERVICE_ACCOUNT\` for GitHub Actions deploy
- Enable Authorization Boost + Smart Retries in Stripe Dashboard
`;
fs.writeFileSync(outMd, md);
console.log(JSON.stringify({ ok: true, overall: checks.overall, outJson, outMd }, null, 2));
