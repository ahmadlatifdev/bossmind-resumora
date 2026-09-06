/**
 * Capture Cloud Run revision IDs for BRoC rollback protection (read-only).
 *
 * Usage:
 *   gcloud run services describe SERVICE --region=us-central1 --project=resumora-live --format="value(status.latestReadyRevisionName)"
 *   node scripts/broc-capture-revision.cjs --service=postadminhermescommand
 *
 * Does not deploy or mutate services. Prints JSON for operators / local Hermes backup.
 */
const { execFileSync } = require('node:child_process');

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : '';
}

function main() {
  const project = arg('project') || process.env.GCP_PROJECT_ID || 'resumora-live';
  const region = arg('region') || process.env.GCP_REGION || 'us-central1';
  const service = arg('service') || 'postadminhermescommand';

  let revisionId = null;
  let error = null;
  try {
    revisionId = execFileSync(
      'gcloud',
      [
        'run',
        'services',
        'describe',
        service,
        `--region=${region}`,
        `--project=${project}`,
        '--format=value(status.latestReadyRevisionName)',
      ],
      { encoding: 'utf8', windowsHide: true }
    ).trim();
  } catch (err) {
    error = String(err && err.message ? err.message : err).slice(0, 300);
  }

  const out = {
    ok: Boolean(revisionId),
    readOnly: true,
    project,
    region,
    service,
    revisionId: revisionId || null,
    error,
    rollbackHint: revisionId
      ? `gcloud run services update-traffic ${service} --to-revisions=${revisionId}=100 --region=${region} --project=${project}`
      : null,
    message: revisionId
      ? 'Last known healthy revision captured (print-only; not applied).'
      : 'Could not resolve revision — ensure gcloud auth and service name.',
  };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  process.exit(revisionId ? 0 : 1);
}

main();
