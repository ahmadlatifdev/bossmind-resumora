#!/usr/bin/env node
/**
 * CI gate — required security headers in firebase.json hosting config.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const firebasePath = path.join(root, 'firebase.json');
const required = [
  { key: 'Strict-Transport-Security', pattern: /max-age=/i },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', pattern: /SAMEORIGIN|DENY/i },
];

if (!fs.existsSync(firebasePath)) {
  console.error('verify-security-headers: firebase.json missing');
  process.exit(1);
}

const cfg = JSON.parse(fs.readFileSync(firebasePath, 'utf8'));
const headers = cfg?.hosting?.headers || [];
const flat = headers.flatMap((block) => block.headers || []);

const errors = [];
for (const req of required) {
  const found = flat.find((h) => h.key === req.key);
  if (!found) {
    errors.push(`Missing header: ${req.key}`);
    continue;
  }
  if (req.value && found.value !== req.value) {
    errors.push(`${req.key} expected "${req.value}", got "${found.value}"`);
  }
  if (req.pattern && !req.pattern.test(String(found.value || ''))) {
    errors.push(`${req.key} value "${found.value}" does not match pattern`);
  }
}

if (errors.length) {
  console.error('verify-security-headers: FAILED');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log('verify-security-headers: Success');
