import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildDependencyDag, triageIdeas } from './triage.js';
import type { RawIdea } from '../types.js';
import { detectRiskFlags } from '../safety/guardrails.js';

describe('idea triage', () => {
  it('orders DAG foundations before dependents', async () => {
    const raw: RawIdea[] = [
      {
        id: 'B',
        title: 'Dependent polish',
        description: 'needs A',
        tags: ['ui'],
        requestedFiles: ['src/pages/AdminIncidentPage.tsx'],
        dependsOn: ['A'],
      },
      {
        id: 'A',
        title: 'Foundation empty state',
        description: 'base copy',
        tags: ['ui'],
        requestedFiles: ['src/pages/MasterAdminPage.tsx'],
        dependsOn: [],
      },
    ];
    const dag = buildDependencyDag(raw);
    assert.equal(dag.get('A')?.depth, 0);
    assert.equal(dag.get('B')?.depth, 1);
    const triaged = await triageIdeas(raw);
    assert.equal(triaged[0]?.id, 'A');
    assert.equal(triaged[1]?.id, 'B');
  });

  it('flags payment and auth for HITL', async () => {
    const pay = detectRiskFlags({
      id: 'P',
      title: 'Stripe webhook tweak',
      description: 'payment gateway',
      tags: ['stripe'],
      requestedFiles: ['functions/index.js'],
      dependsOn: [],
    });
    assert.ok(pay.includes('payments'));
    const auth = detectRiskFlags({
      id: 'A',
      title: 'Auth session',
      description: 'firebase auth',
      tags: ['auth'],
      requestedFiles: ['src/auth/AuthContext.tsx'],
      dependsOn: [],
    });
    assert.ok(auth.includes('auth'));
  });

  it('deduplicates near-identical titles', async () => {
    const raw: RawIdea[] = [
      {
        id: '1',
        title: 'Add empty state to admin feed',
        description: 'copy',
        tags: [],
        requestedFiles: [],
        dependsOn: [],
      },
      {
        id: '2',
        title: 'Add empty state to admin feed',
        description: 'copy again',
        tags: [],
        requestedFiles: [],
        dependsOn: [],
      },
    ];
    const out = await triageIdeas(raw);
    const dup = out.find((i) => i.id === '2');
    assert.equal(dup?.duplicateOf, '1');
  });
});
