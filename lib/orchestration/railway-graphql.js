/**
 * Railway GraphQL v2 (Bearer RAILWAY_TOKEN).
 * Used by closed-loop repair worker — never log tokens.
 */

const RAILWAY_GRAPHQL = "https://backboard.railway.app/graphql/v2";

/**
 * @param {{ token: string, query: string, variables?: Record<string, unknown> }} opts
 */
async function railwayGraphql({ token, query, variables = {} }) {
  if (!token) {
    return { ok: false, status: 0, json: { errors: [{ message: "missing_token" }] } };
  }
  const res = await fetch(RAILWAY_GRAPHQL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  let json = {};
  try {
    json = await res.json();
  } catch {
    json = { errors: [{ message: "invalid_json_response" }] };
  }
  return { ok: res.ok, status: res.status, json };
}

/**
 * Fetch latest deployment edges for a project (best-effort).
 * @param {{ token: string, projectId: string }} opts
 */
async function railwayFetchRecentDeployments({ token, projectId }) {
  if (!projectId) return { ok: false, reason: "missing_project_id", deployments: [] };
  const query = `query Deployments($id: String!) {
    project(id: $id) {
      id
      deployments(first: 8) {
        edges {
          node {
            id
            status
            createdAt
            meta
          }
        }
      }
    }
  }`;
  const r = await railwayGraphql({ token, query, variables: { id: projectId } });
  const edges = r.json?.data?.project?.deployments?.edges || [];
  const deployments = edges.map((e) => e?.node).filter(Boolean);
  return { ok: r.ok && !r.json?.errors?.length, status: r.status, deployments, rawErrors: r.json?.errors };
}

/**
 * Trigger redeploy (optional — requires BOSSMIND_RAILWAY_AUTO_REDEPLOY=1 in caller).
 * @param {{ token: string, environmentId: string, serviceId: string }} opts
 */
async function railwayServiceInstanceRedeploy({ token, environmentId, serviceId }) {
  const mutation = `mutation Redeploy($e: String!, $s: String!) {
    serviceInstanceRedeploy(environmentId: $e, serviceId: $s)
  }`;
  return railwayGraphql({
    token,
    query: mutation,
    variables: { e: environmentId, s: serviceId },
  });
}

module.exports = {
  railwayGraphql,
  railwayFetchRecentDeployments,
  railwayServiceInstanceRedeploy,
};
