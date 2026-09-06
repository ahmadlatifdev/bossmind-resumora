/**
 * Local BRoC auto-backup helper — git status + optional commit (no force, no secrets).
 * Invoked by hermes HITL /api/broc/local-backup or manually: node scripts/broc-auto-backup.cjs
 */
const { execSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function run(cmd) {
  return execSync(cmd, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }).trim();
}

function main() {
  const doCommit = process.argv.includes('--commit');
  const branch = run('git rev-parse --abbrev-ref HEAD');
  const sha = run('git rev-parse --short HEAD');
  const status = run('git status --porcelain');
  const dirty = Boolean(status);
  let commit = null;
  let push = null;

  if (doCommit && dirty) {
    run('git add -A');
    try {
      run('git commit -m "chore(broc): automatic operations snapshot"');
      commit = run('git rev-parse --short HEAD');
    } catch (err) {
      commit = { error: String(err && err.message ? err.message : err).slice(0, 200) };
    }
    try {
      run('git push');
      push = 'ok';
    } catch (err) {
      push = { error: String(err && err.message ? err.message : err).slice(0, 200) };
    }
  }

  const result = {
    ok: true,
    readOnly: !doCommit,
    branch,
    sha,
    dirty,
    commit,
    push,
    statusLines: status ? status.split(/\r?\n/).length : 0,
    message: doCommit
      ? 'Local git snapshot attempted'
      : 'Read-only git status captured (pass --commit to commit/push)',
  };
  process.stdout.write(JSON.stringify(result) + '\n');
}

main();
