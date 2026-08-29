/**
 * Security audit runner — npm audit + dependency + env key scan (no secret values).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const reportPath = path.join(root, 'docs', 'security-audit-report.json');

const forbiddenPatterns = [
  /sk_live_[a-zA-Z0-9]+/,
  /whsec_[a-zA-Z0-9]+/,
  /AIza[0-9A-Za-z_-]{35}/,
];

function scanFileForLeaks(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const hits = [];
  for (const re of forbiddenPatterns) {
    if (re.test(text)) hits.push(re.source);
  }
  return hits;
}

function walkSource(dir) {
  const leaks = [];
  if (!fs.existsSync(dir)) return leaks;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (name === 'node_modules' || name === 'dist') continue;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) leaks.push(...walkSource(full));
    else if (/\.(ts|tsx|js|jsx|mjs|md|json)$/.test(name) && !name.includes('.env')) {
      const hits = scanFileForLeaks(full);
      if (hits.length) leaks.push({ file: path.relative(root, full), patterns: hits });
    }
  }
  return leaks;
}

let audit = { vulnerabilities: {}, error: null };
try {
  const raw = execSync('npm audit --json', { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  audit = JSON.parse(raw);
} catch (err) {
  try {
    audit = JSON.parse(String(err.stdout || '{}'));
  } catch {
    audit.error = err.message;
  }
}

const leakScan = walkSource(root);
const report = {
  timestamp: new Date().toISOString(),
  npmAudit: {
    total: audit.metadata?.vulnerabilities || audit.vulnerabilities || {},
    error: audit.error || null,
  },
  secretLeakScan: {
    filesWithSuspiciousPatterns: leakScan.length,
    findings: leakScan.slice(0, 20),
  },
  recommendations: [
    'Keep STRIPE_* and Firebase keys in secrets.env / GitHub Secrets only',
    'Run npm audit fix for low-risk patches weekly',
    'Enable security-audit.yml on every PR',
  ],
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: true, reportPath, leaks: leakScan.length }, null, 2));
process.exit(leakScan.length > 0 ? 1 : 0);
