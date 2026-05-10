/** Service keys allowed for Free Test (matches catalogue resourceKey values). */
const FREE_TEST_SERVICE_KEYS = [
  "svc_ats",
  "svc_letter",
  "svc_linkedin",
  "svc_interview",
  "svc_tls",
  "svc_support",
];

function normalizeEmail(v) {
  return String(v ?? "")
    .trim()
    .toLowerCase();
}

function isAllowedServiceKey(key) {
  return FREE_TEST_SERVICE_KEYS.includes(String(key || "").trim());
}

module.exports = { FREE_TEST_SERVICE_KEYS, normalizeEmail, isAllowedServiceKey };
