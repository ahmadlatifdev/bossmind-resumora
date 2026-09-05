import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { RawIdeaSchema, type RawIdea } from '../types.js';

function splitList(value: unknown): string[] {
  if (Array.isArray(value))
    return value
      .map(String)
      .map((s) => s.trim())
      .filter(Boolean);
  if (typeof value !== 'string' || !value.trim()) return [];
  return value
    .split(/[|;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function loadBacklog(filePath: string): Promise<RawIdea[]> {
  const abs = path.resolve(filePath);
  const raw = await readFile(abs, 'utf8');
  const lower = abs.toLowerCase();

  let rows: unknown[];
  if (lower.endsWith('.json')) {
    const parsed = JSON.parse(raw) as unknown;
    rows = Array.isArray(parsed) ? parsed : [parsed];
  } else if (lower.endsWith('.csv')) {
    rows = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];
  } else {
    throw new Error(`Unsupported backlog format: ${abs}`);
  }

  const ideas: RawIdea[] = [];
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const candidate = {
      id: String(r.id ?? r.ID ?? '').trim(),
      title: String(r.title ?? r.Title ?? '').trim(),
      description: String(r.description ?? r.Description ?? ''),
      source: r.source ? String(r.source) : undefined,
      tags: splitList(r.tags ?? r.Tags),
      requestedFiles: splitList(r.requestedFiles ?? r.files ?? r.requested_files),
      dependsOn: splitList(r.dependsOn ?? r.depends_on ?? r.deps),
      priorityHint:
        r.priorityHint != null && String(r.priorityHint).trim() !== ''
          ? Number(r.priorityHint)
          : r.priority != null
            ? Number(r.priority)
            : undefined,
    };
    const parsedIdea = RawIdeaSchema.safeParse(candidate);
    if (!parsedIdea.success) {
      console.warn('[ingest] skipping invalid row', parsedIdea.error.flatten());
      continue;
    }
    ideas.push(parsedIdea.data);
  }
  return ideas;
}
