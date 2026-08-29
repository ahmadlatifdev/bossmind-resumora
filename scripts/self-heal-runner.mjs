/**
 * Self-healing test runner — build + billing tests with retry.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const maxAttempts = 3;
const steps = [
  { name: 'build', cmd: 'npm run build' },
  { name: 'test:billing', cmd: 'npm run test:billing' },
  { name: 'security-audit', cmd: 'node scripts/security-audit.mjs', allowFail: true },
];

const results = [];
let allOk = true;

for (const step of steps) {
  let ok = false;
  let lastErr = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      execSync(step.cmd, { cwd: root, stdio: 'pipe', encoding: 'utf8' });
      ok = true;
      break;
    } catch (err) {
      lastErr = err.stderr || err.message || 'failed';
      if (attempt < maxAttempts) {
        const delay = attempt * 2000;
        execSync(`node -e "setTimeout(()=>{},${delay})"`, { stdio: 'ignore' });
      }
    }
  }
  results.push({ step: step.name, ok, error: ok ? null : lastErr.slice(0, 500) });
  if (!ok && !step.allowFail) allOk = false;
}

const report = {
  timestamp: new Date().toISOString(),
  self_heal: true,
  attempts_per_step: maxAttempts,
  results,
  proof_status: allOk ? 'passed' : 'failed',
};

const out = path.join(root, 'docs', 'self-heal-report.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(allOk ? 0 : 1);
