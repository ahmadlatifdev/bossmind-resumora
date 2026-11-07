/**
 * BossMind orchestrator sync — fetches the read-only benefits/features catalog
 * for the "God View" admin. Owner/super-admin gated on the backend.
 */

export type OrchestratorTier = {
  id: string;
  name: string;
  price: string;
  highlighted: boolean;
  features: string[];
};

export type OrchestratorFeatureFlag = {
  key: string;
  label: string;
  enabled: boolean;
};

export type OrchestratorProject = {
  id: string;
  name: string;
  tiers: OrchestratorTier[];
  featureFlags: OrchestratorFeatureFlag[];
};

export type OrchestratorCatalog = {
  ok?: boolean;
  owner?: boolean;
  projects: OrchestratorProject[];
};

export async function fetchOrchestratorCatalog(
  ownerPassword: string
): Promise<OrchestratorCatalog> {
  const res = await fetch('/api/orchestrator/catalog', {
    headers: { 'X-Admin-Password': ownerPassword },
  });
  const data = (await res.json().catch(() => ({}))) as OrchestratorCatalog;
  if (!res.ok) {
    const err = new Error((data as { error?: string }).error || `HTTP ${res.status}`);
    (err as Error & { statusCode?: number }).statusCode = res.status;
    throw err;
  }
  return data;
}
