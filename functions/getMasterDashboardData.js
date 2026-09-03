/**
 * Aggregates Master Admin project registry + health for the Unified Harness.
 */
const { listMasterProjects } = require('./lib/projectRegistry');
const { buildMasterDashboard } = require('./lib/masterDashboard');

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {object} snapshot selfHeal health snapshot
 */
async function getMasterDashboardData(db, snapshot) {
  const [dashboard, registry] = await Promise.all([
    buildMasterDashboard(db, snapshot),
    listMasterProjects(db, snapshot),
  ]);
  return {
    ...dashboard,
    harness: {
      averageHealth: registry.averageHealth,
      projects: registry.projects,
      generatedAt: registry.generatedAt,
    },
  };
}

module.exports = { getMasterDashboardData };
