import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../config.js';
/** Deterministic local embedding — works offline without OpenAI/Pinecone keys. */
export function embedText(text, dim = 384) {
  const vec = new Array(dim).fill(0);
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/)
    .filter(Boolean);
  for (const token of tokens) {
    const h = createHash('sha256').update(token).digest();
    for (let i = 0; i < dim; i++) {
      vec[i] += (h[i % h.length] / 255) * 2 - 1;
    }
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}
export function cosine(a, b) {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}
async function pineconeQuery(vector, topK) {
  const cfg = loadConfig();
  if (!cfg.PINECONE_API_KEY || !cfg.PINECONE_HOST) return [];
  const res = await fetch(`https://${cfg.PINECONE_HOST}/query`, {
    method: 'POST',
    headers: {
      'Api-Key': cfg.PINECONE_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      vector,
      topK,
      includeMetadata: true,
      namespace: '',
    }),
  });
  if (!res.ok) {
    console.warn('[rag] pinecone query failed', res.status);
    return [];
  }
  const data = await res.json();
  return data.matches || [];
}
async function readLocalCandidates(repoRoot, idea) {
  const paths = new Set([
    ...idea.requestedFiles,
    'docs/DEPLOYMENT_MASTER_GUIDE.md',
    'AGENTS.md',
    'hermes-idea-queue/README.md',
  ]);
  const chunks = [];
  const query = embedText(`${idea.title}\n${idea.description}\n${idea.tags.join(' ')}`);
  for (const rel of paths) {
    const abs = path.resolve(repoRoot, rel);
    try {
      const statPath = abs;
      // If directory hint, skip binary read — try common files only when exact file
      const text = await readFile(statPath, 'utf8');
      const excerpt = text.slice(0, 4000);
      const score = cosine(query, embedText(excerpt));
      chunks.push({ path: rel, score, text: excerpt });
    } catch {
      // path may be a directory or missing — ignore
    }
  }
  return chunks.sort((a, b) => b.score - a.score);
}
export async function compressContext(idea) {
  const cfg = loadConfig();
  const queryVec = embedText(`${idea.title}\n${idea.description}`, cfg.EMBEDDING_DIM);
  const remote = await pineconeQuery(queryVec, cfg.RAG_TOP_K);
  const local = await readLocalCandidates(cfg.REPO_ROOT, idea);
  const merged = [
    ...remote.map((m) => ({
      path: m.metadata?.path || m.id,
      score: m.score,
      text: (m.metadata?.text || '').slice(0, 3000),
    })),
    ...local,
  ]
    .filter((c) => c.text)
    .sort((a, b) => b.score - a.score)
    .slice(0, cfg.RAG_TOP_K);
  const parts = [
    `# Task ${idea.id}`,
    `Title: ${idea.title}`,
    `Description: ${idea.description}`,
    `Priority: ${idea.priorityScore}`,
    `Risk flags: ${idea.riskFlags.join(', ') || 'none'}`,
    `Depends on: ${idea.dependsOn.join(', ') || 'none'}`,
    '',
    '# Relevant context (compressed)',
  ];
  let used = parts.join('\n').length;
  for (const chunk of merged) {
    const block = `\n## ${chunk.path} (score=${chunk.score.toFixed(3)})\n${chunk.text}\n`;
    if (used + block.length > cfg.RAG_MAX_CHARS) break;
    parts.push(block);
    used += block.length;
  }
  parts.push(
    '\n# Constraints\n- Tiny incremental patch only\n- Do not edit locked chrome or secrets\n- Do not deploy; open a PR only\n- Never print secret values\n'
  );
  return parts.join('\n');
}
