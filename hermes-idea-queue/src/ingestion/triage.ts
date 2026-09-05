import { loadConfig } from '../config.js';
import type { DagNode, RawIdea, TriagedIdea } from '../types.js';
import { detectRiskFlags } from '../safety/guardrails.js';

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function jaccard(a: string, b: string): number {
  const as = new Set(
    normalizeText(a)
      .split(' ')
      .filter((w) => w.length > 2)
  );
  const bs = new Set(
    normalizeText(b)
      .split(' ')
      .filter((w) => w.length > 2)
  );
  if (!as.size || !bs.size) return 0;
  let inter = 0;
  for (const w of as) if (bs.has(w)) inter += 1;
  return inter / (as.size + bs.size - inter);
}

export function buildDependencyDag(ideas: RawIdea[]): Map<string, DagNode> {
  const byId = new Map(ideas.map((i) => [i.id, i]));
  const nodes = new Map<string, DagNode>();
  const visiting = new Set<string>();

  function depthOf(id: string): number {
    if (nodes.has(id)) return nodes.get(id)!.depth;
    if (visiting.has(id)) {
      throw new Error(`Dependency cycle detected at ${id}`);
    }
    visiting.add(id);
    const idea = byId.get(id);
    const deps = (idea?.dependsOn || []).filter((d) => byId.has(d));
    const depth = deps.length ? 1 + Math.max(...deps.map(depthOf)) : 0;
    visiting.delete(id);
    nodes.set(id, { id, dependsOn: deps, depth });
    return depth;
  }

  for (const idea of ideas) depthOf(idea.id);
  return nodes;
}

function heuristicPriority(idea: RawIdea, dagDepth: number, riskCount: number): number {
  const hint = idea.priorityHint ?? 50;
  const tagBoost = idea.tags.includes('security') ? 10 : 0;
  const depthPenalty = Math.min(20, dagDepth * 5);
  const riskBoost = Math.min(25, riskCount * 8);
  return Math.max(0, Math.min(100, hint + tagBoost + riskBoost - depthPenalty));
}

async function llmRefinePriorities(ideas: TriagedIdea[]): Promise<TriagedIdea[]> {
  const cfg = loadConfig();
  if (!cfg.HERMES_LLM_API_KEY) return ideas;

  const prompt = {
    model: cfg.HERMES_LLM_MODEL,
    temperature: 0.1,
    messages: [
      {
        role: 'system',
        content:
          'You triage engineering ideas. Return JSON array of {id, priorityScore 0-100, duplicateOf null|id}. Deduplicate near-identical requests. No prose.',
      },
      {
        role: 'user',
        content: JSON.stringify(
          ideas.map((i) => ({
            id: i.id,
            title: i.title,
            description: i.description,
            tags: i.tags,
            dependsOn: i.dependsOn,
            priorityScore: i.priorityScore,
          }))
        ),
      },
    ],
  };

  try {
    const res = await fetch(`${cfg.HERMES_LLM_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.HERMES_LLM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(prompt),
    });
    if (!res.ok) {
      console.warn('[triage] LLM HTTP', res.status);
      return ideas;
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content || '[]';
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return ideas;
    const refined = JSON.parse(jsonMatch[0]) as Array<{
      id: string;
      priorityScore?: number;
      duplicateOf?: string | null;
    }>;
    const byId = new Map(refined.map((r) => [r.id, r]));
    return ideas.map((idea) => {
      const hit = byId.get(idea.id);
      if (!hit) return idea;
      return {
        ...idea,
        priorityScore:
          typeof hit.priorityScore === 'number'
            ? Math.max(0, Math.min(100, hit.priorityScore))
            : idea.priorityScore,
        duplicateOf: hit.duplicateOf ?? idea.duplicateOf,
        status: hit.duplicateOf ? 'rejected' : idea.status,
      };
    });
  } catch (err) {
    console.warn('[triage] LLM failed, using heuristics', err);
    return ideas;
  }
}

export async function triageIdeas(raw: RawIdea[]): Promise<TriagedIdea[]> {
  const dag = buildDependencyDag(raw);
  const sorted = [...raw].sort((a, b) => a.id.localeCompare(b.id));

  const triaged: TriagedIdea[] = [];
  for (const idea of sorted) {
    let duplicateOf: string | null = null;
    for (const prev of triaged) {
      if (prev.duplicateOf) continue;
      const score = Math.max(
        jaccard(idea.title, prev.title),
        jaccard(`${idea.title} ${idea.description}`, `${prev.title} ${prev.description}`)
      );
      if (score >= 0.82) {
        duplicateOf = prev.id;
        break;
      }
    }

    const riskFlags = detectRiskFlags(idea);
    const node = dag.get(idea.id)!;
    const priorityScore = heuristicPriority(idea, node.depth, riskFlags.length);
    triaged.push({
      ...idea,
      status: duplicateOf ? 'rejected' : riskFlags.length ? 'awaiting_hitl' : 'triaged',
      priorityScore,
      duplicateOf,
      riskFlags,
      requiresHitl: riskFlags.length > 0,
      dagDepth: node.depth,
      qaAttempts: 0,
      lockedFiles: [],
    });
  }

  const refined = await llmRefinePriorities(triaged);
  // Foundational DAG depth first, then priority descending among peers
  return refined.sort((a, b) => {
    if (a.dagDepth !== b.dagDepth) return a.dagDepth - b.dagDepth;
    return b.priorityScore - a.priorityScore;
  });
}

export function topologicalReady(ideas: TriagedIdea[], completedIds: Set<string>): TriagedIdea[] {
  return ideas.filter((idea) => {
    if (idea.duplicateOf || idea.status === 'rejected' || idea.status === 'done') return false;
    if (idea.status === 'awaiting_hitl') return false;
    return idea.dependsOn.every((d) => completedIds.has(d));
  });
}
