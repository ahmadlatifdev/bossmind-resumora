/**
 * Tool registry — enforces admin vs client scope isolation.
 * Client scope must never invoke mutation / system tools.
 */

import type { HarnessScope } from './harnessTypes';

export type HarnessToolDefinition = {
  name: string;
  scopes: HarnessScope[];
  description: string;
  mutating: boolean;
};

const ADMIN_ONLY: HarnessScope[] = ['admin'];
const CLIENT_SAFE: HarnessScope[] = ['client', 'admin'];

export const HARNESS_TOOLS: HarnessToolDefinition[] = [
  {
    name: 'readFile',
    scopes: ADMIN_ONLY,
    description: 'Read a project file (admin)',
    mutating: false,
  },
  {
    name: 'writeFile',
    scopes: ADMIN_ONLY,
    description: 'Propose or apply a file write (admin)',
    mutating: true,
  },
  {
    name: 'runBuild',
    scopes: ADMIN_ONLY,
    description: 'Run npm run build (admin)',
    mutating: true,
  },
  {
    name: 'deployHosting',
    scopes: ADMIN_ONLY,
    description: 'Trigger Hosting deploy (admin)',
    mutating: true,
  },
  {
    name: 'updateFirestore',
    scopes: ADMIN_ONLY,
    description: 'Update a Firestore document (admin)',
    mutating: true,
  },
  {
    name: 'runHealthCycle',
    scopes: ADMIN_ONLY,
    description: 'Run system health / self-heal cycle (admin)',
    mutating: true,
  },
  {
    name: 'regenerateManual',
    scopes: ADMIN_ONLY,
    description: 'Regenerate system manual documentation (admin)',
    mutating: true,
  },
  {
    name: 'searchDocs',
    scopes: CLIENT_SAFE,
    description: 'Search public product docs / FAQ',
    mutating: false,
  },
  {
    name: 'getFaq',
    scopes: CLIENT_SAFE,
    description: 'Return a FAQ answer',
    mutating: false,
  },
  {
    name: 'explainFeature',
    scopes: CLIENT_SAFE,
    description: 'Explain a client-facing feature',
    mutating: false,
  },
  {
    name: 'checkOrderStatus',
    scopes: CLIENT_SAFE,
    description: 'Check order / subscription status for the signed-in user',
    mutating: false,
  },
  {
    name: 'createSupportTicket',
    scopes: CLIENT_SAFE,
    description: 'Create a support ticket (escalation)',
    mutating: true,
  },
];

const BY_NAME = new Map(HARNESS_TOOLS.map((t) => [t.name, t]));

export function getToolDefinition(tool: string): HarnessToolDefinition | undefined {
  return BY_NAME.get(String(tool || '').trim());
}

/** Throws if the tool is unknown or not allowed for the given scope. */
export function assertToolAllowed(tool: string, scope: HarnessScope): void {
  const name = String(tool || '').trim();
  const def = BY_NAME.get(name);
  if (!def) {
    throw new Error(`Unknown harness tool: ${name}`);
  }
  if (!def.scopes.includes(scope)) {
    throw new Error(
      `Tool "${name}" is not allowed for scope "${scope}". Admin-only tools cannot run in client harness.`
    );
  }
}

export function listAllowedTools(scope: HarnessScope): string[] {
  return HARNESS_TOOLS.filter((t) => t.scopes.includes(scope)).map((t) => t.name);
}

export function isMutatingTool(tool: string): boolean {
  return Boolean(BY_NAME.get(String(tool || '').trim())?.mutating);
}
