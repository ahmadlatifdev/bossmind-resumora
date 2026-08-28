#!/usr/bin/env bash
# Cloud Shell — update Resumora Stripe secrets + bind to Cloud Run Gen2 services.
# Never echoes full secrets; prints only the first 10 characters for verification.
#
# Usage (Cloud Shell, project resumora-live):
#   bash cloudshell-update-stripe-secrets.sh
#   # prompts for STRIPE_SECRET_KEY (sk_live_...) and STRIPE_WEBHOOK_SECRET (whsec_...)
#
# Or non-interactive:
#   export STRIPE_SECRET_KEY='sk_live_...'
#   export STRIPE_WEBHOOK_SECRET='whsec_...'
#   bash cloudshell-update-stripe-secrets.sh
#
# Optional:
#   PROJECT_ID=resumora-live REGION=us-central1 bash cloudshell-update-stripe-secrets.sh

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-resumora-live}"
REGION="${REGION:-us-central1}"
# Firebase Gen2 / Cloud Run service names (lowercase)
CHECKOUT_SERVICE="${CHECKOUT_SERVICE:-createcheckoutsession}"
WEBHOOK_SERVICE="${WEBHOOK_SERVICE:-stripewebhook}"

# Secret Manager secret IDs used by functions/index.js defineSecret(...)
# STRIPE_API_KEY is what createCheckoutSession / stripeWebhook mount via Secret Manager.
# Also keep STRIPE_SECRET_KEY in sync for env-var consumers / scripts.
SM_API_KEY_SECRET="${SM_API_KEY_SECRET:-STRIPE_API_KEY}"
SM_SECRET_KEY_ALIAS="${SM_SECRET_KEY_ALIAS:-STRIPE_SECRET_KEY}"
SM_WEBHOOK_SECRET="${SM_WEBHOOK_SECRET:-STRIPE_WEBHOOK_SECRET}"

prefix10() {
  local v="${1:-}"
  if [[ -z "${v}" ]]; then
    echo "(empty)"
    return
  fi
  echo "${v:0:10}..."
}

kind_of() {
  local v="${1:-}"
  case "${v}" in
    sk_live_*) echo "live_secret" ;;
    sk_test_*) echo "test_secret" ;;
    whsec_*) echo "webhook_signing" ;;
    *) echo "unexpected_format" ;;
  esac
}

ensure_secret() {
  local name="$1"
  if gcloud secrets describe "${name}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
    echo "Secret exists: ${name}"
  else
    echo "Creating secret: ${name}"
    gcloud secrets create "${name}" --project="${PROJECT_ID}" --replication-policy=automatic
  fi
}

add_secret_version() {
  local name="$1"
  local value="$2"
  # Prefer process substitution so the secret never lands in shell history as echo args in some shells.
  printf '%s' "${value}" | gcloud secrets versions add "${name}" \
    --project="${PROJECT_ID}" \
    --data-file=-
}

echo "=== Resumora Stripe secret cutover (Cloud Shell) ==="
echo "Project: ${PROJECT_ID}"
echo "Region:  ${REGION}"
echo "Services: ${CHECKOUT_SERVICE}, ${WEBHOOK_SERVICE}"
echo

if [[ -z "${STRIPE_SECRET_KEY:-}" ]]; then
  read -r -s -p "Paste new STRIPE_SECRET_KEY (sk_live_...): " STRIPE_SECRET_KEY
  echo
fi
if [[ -z "${STRIPE_WEBHOOK_SECRET:-}" ]]; then
  read -r -s -p "Paste new STRIPE_WEBHOOK_SECRET (whsec_...): " STRIPE_WEBHOOK_SECRET
  echo
fi

if [[ -z "${STRIPE_SECRET_KEY}" || -z "${STRIPE_WEBHOOK_SECRET}" ]]; then
  echo "ERROR: both STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are required." >&2
  exit 1
fi

# Live cutover default: require sk_live_ (set ALLOW_TEST_KEYS=1 only for non-prod experiments).
if [[ "${ALLOW_TEST_KEYS:-0}" != "1" ]]; then
  if [[ "${STRIPE_SECRET_KEY}" != sk_live_* ]]; then
    echo "ERROR: production cutover requires sk_live_... (got unexpected prefix)." >&2
    echo "  Refusing test keys. Set ALLOW_TEST_KEYS=1 only if you intentionally want sk_test_." >&2
    exit 1
  fi
elif [[ "${STRIPE_SECRET_KEY}" != sk_live_* && "${STRIPE_SECRET_KEY}" != sk_test_* ]]; then
  echo "ERROR: STRIPE_SECRET_KEY must start with sk_live_ or sk_test_" >&2
  exit 1
fi
if [[ "${STRIPE_WEBHOOK_SECRET}" != whsec_* ]]; then
  echo "ERROR: STRIPE_WEBHOOK_SECRET must start with whsec_" >&2
  exit 1
fi

echo "Key check (prefixes only):"
echo "  STRIPE_SECRET_KEY     prefix=$(prefix10 "${STRIPE_SECRET_KEY}") kind=$(kind_of "${STRIPE_SECRET_KEY}") len=${#STRIPE_SECRET_KEY}"
echo "  STRIPE_WEBHOOK_SECRET prefix=$(prefix10 "${STRIPE_WEBHOOK_SECRET}") kind=$(kind_of "${STRIPE_WEBHOOK_SECRET}") len=${#STRIPE_WEBHOOK_SECRET}"
echo

gcloud config set project "${PROJECT_ID}" >/dev/null

ensure_secret "${SM_API_KEY_SECRET}"
ensure_secret "${SM_SECRET_KEY_ALIAS}"
ensure_secret "${SM_WEBHOOK_SECRET}"

echo "Adding Secret Manager versions..."
add_secret_version "${SM_API_KEY_SECRET}" "${STRIPE_SECRET_KEY}"
add_secret_version "${SM_SECRET_KEY_ALIAS}" "${STRIPE_SECRET_KEY}"
add_secret_version "${SM_WEBHOOK_SECRET}" "${STRIPE_WEBHOOK_SECRET}"
echo "Secret versions added."

# Grant the Cloud Run runtime service account access (best-effort; may already exist).
PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
RUNTIME_SA="${RUNTIME_SA:-${PROJECT_NUMBER}-compute@developer.gserviceaccount.com}"
echo "Ensuring secretAccessor for ${RUNTIME_SA}..."
for s in "${SM_API_KEY_SECRET}" "${SM_SECRET_KEY_ALIAS}" "${SM_WEBHOOK_SECRET}"; do
  gcloud secrets add-iam-policy-binding "${s}" \
    --project="${PROJECT_ID}" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    >/dev/null || true
done

echo "Updating Cloud Run services to mount latest secrets..."
# createcheckoutsession currently has INLINE sk_live_ env vars — remove plain-text
# and bind Secret Manager so cutover is one place (Secret Manager latest).
gcloud run services update "${CHECKOUT_SERVICE}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --remove-env-vars="STRIPE_API_KEY,STRIPE_SECRET_KEY,STRIPE_WEBHOOK_SECRET" \
  --update-secrets="STRIPE_API_KEY=${SM_API_KEY_SECRET}:latest,STRIPE_SECRET_KEY=${SM_SECRET_KEY_ALIAS}:latest,STRIPE_WEBHOOK_SECRET=${SM_WEBHOOK_SECRET}:latest" \
  --quiet

gcloud run services update "${WEBHOOK_SERVICE}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --remove-env-vars="STRIPE_API_KEY,STRIPE_SECRET_KEY,STRIPE_WEBHOOK_SECRET" \
  --update-secrets="STRIPE_API_KEY=${SM_API_KEY_SECRET}:latest,STRIPE_SECRET_KEY=${SM_SECRET_KEY_ALIAS}:latest,STRIPE_WEBHOOK_SECRET=${SM_WEBHOOK_SECRET}:latest" \
  --quiet

echo
echo "=== Done ==="
echo "Verify Cloud Logging for createCheckoutSession / stripeWebhook:"
echo "  Look for keyPrefix=$(prefix10 "${STRIPE_SECRET_KEY}") on Invalid API Key or successful checkout."
echo "Probe (expect cs_live_... when live key is valid):"
echo "  curl -sS -X POST \"https://${REGION}-${PROJECT_ID}.cloudfunctions.net/createCheckoutSession\" \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"planId\":\"basic\",\"expectedCents\":2900}' | head -c 400; echo"
echo
echo "Clear local shell vars when finished:"
echo "  unset STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET"
