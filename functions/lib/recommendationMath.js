/**
 * Recommendation vector helpers.
 */
'use strict';

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = Number(a[i]) || 0;
    const y = Number(b[i]) || 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (!denom) return 0;
  return dot / denom;
}

function averageEmbeddings(vectors) {
  const list = (vectors || []).filter((v) => Array.isArray(v) && v.length);
  if (!list.length) return null;
  const dims = list[0].length;
  const out = new Array(dims).fill(0);
  for (const vec of list) {
    if (vec.length !== dims) continue;
    for (let i = 0; i < dims; i += 1) out[i] += Number(vec[i]) || 0;
  }
  const n = list.length;
  return out.map((v) => v / n);
}

module.exports = {
  cosineSimilarity,
  averageEmbeddings,
};
