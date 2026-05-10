const fs = require("fs");
const path = require("path");

const policyPath = path.join(
  process.cwd(),
  "config",
  "bossmind-orchestration-policy.json"
);

function loadRolePolicy() {
  if (!fs.existsSync(policyPath)) {
    return {
      loaded: false,
      path: policyPath,
      reason: "policy_missing",
      policy: null,
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(policyPath, "utf8"));
    return {
      loaded: true,
      path: policyPath,
      reason: "",
      policy: parsed,
    };
  } catch (error) {
    return {
      loaded: false,
      path: policyPath,
      reason: `invalid_json:${error.message}`,
      policy: null,
    };
  }
}

module.exports = {
  loadRolePolicy,
  policyPath,
};
