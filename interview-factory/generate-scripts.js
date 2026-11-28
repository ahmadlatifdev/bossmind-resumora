// generate-scripts.js — BossMind Script Chunker Agent
// Generates long-form interview scripts in ~1000-word chunks via a chat model.
// Usage:  $env:DEEPSEEK_API_KEY="..." ; node generate-scripts.js
import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = 'D:/BossMind/bossmind-resumora/interview-factory/stage_1_master';
const API_KEY = process.env.DEEPSEEK_API_KEY || '';
const BASE = 'https://api.deepseek.com';
const MODEL = 'deepseek-chat';

const CONFIG = [
  {
    file: 'video_1_recruiter_screen.txt',
    target: 3000,
    title: 'Recruiter Screen (20 min)',
    outline:
      'Intro, resume overview, salary alignment, logistics, basic qualifications. Interviewer + Expert + occasional B-Roll.',
  },
  {
    file: 'video_2_hiring_manager.txt',
    target: 7500,
    title: 'Hiring Manager (50 min)',
    outline:
      '5-6 deep STAR questions, past projects, conflict resolution, working style, ownership.',
  },
  {
    file: 'video_3_technical_case.txt',
    target: 11000,
    title: 'Technical Case (75 min)',
    outline:
      'System design, API architecture, database scaling, trade-offs, live problem-solving walkthroughs.',
  },
  {
    file: 'video_4_peer_culture.txt',
    target: 5500,
    title: 'Peer Culture (35 min)',
    outline:
      'Code reviews, team collaboration, crunch time, communication style, cultural alignment.',
  },
  {
    file: 'video_5_executive_final.txt',
    target: 5500,
    title: 'Executive Final (35 min)',
    outline:
      'Leadership vision, industry trends, business impact, strategic thinking, long-term career goals.',
  },
];

function countWords(s) {
  return (String(s).match(/\S+/g) || []).length;
}

async function chat(messages) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ model: MODEL, messages, max_tokens: 1600, temperature: 0.8 }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message || JSON.stringify(j));
  return j.choices[0].message.content;
}

function trimToBoundary(text, limit) {
  // Trim only at a clean scene/dialogue boundary (a blank line before a [tag]).
  const parts = text.split(/\n\s*\n/);
  let out = '';
  for (const p of parts) {
    if (countWords(out + ' ' + p) > limit) break;
    out += (out ? '\n\n' : '') + p;
  }
  return out;
}

async function generateOne(cfg) {
  const existingPath = path.join(OUT_DIR, cfg.file);
  let buffer = fs.existsSync(existingPath) ? fs.readFileSync(existingPath, 'utf8').trim() : '';
  while (countWords(buffer) < cfg.target) {
    const tail = buffer.split(/\s+/).slice(-600).join(' ');
    const prompt =
      `You are writing "${cfg.title}".\n` +
      `Outline: ${cfg.outline}\n` +
      `Target total: ${cfg.target} words. Current: ${countWords(buffer)}.\n` +
      `Previous text (last ~600 words, for continuity):\n"""${tail}"""\n\n` +
      `Continue the script naturally from the previous chunk. Do not recap. Do not restart. ` +
      `Write only the next ~1000 words, in this exact format:\n` +
      `[Interviewer]: ...\n[Expert]: ...\n[B-Roll]: ...\n`;
    const chunk = await chat([{ role: 'user', content: prompt }]);
    buffer = (buffer ? buffer + '\n\n' : '') + chunk.trim();
    process.stdout.write(`  ${cfg.file}: ${countWords(buffer)}/${cfg.target} words\n`);
  }
  if (countWords(buffer) > cfg.target) buffer = trimToBoundary(buffer, cfg.target);
  const outPath = path.join(OUT_DIR, cfg.file);
  fs.writeFileSync(outPath, buffer.trim(), 'utf8');
  return { file: cfg.file, words: countWords(buffer) };
}

function validate(text) {
  const missing = ['[Interviewer]:', '[Expert]:', '[B-Roll]:'].filter((t) => !text.includes(t));
  return missing;
}

(async () => {
  if (!API_KEY) {
    console.error('Set DEEPSEEK_API_KEY before running.');
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const cfg of CONFIG) {
    const p = path.join(OUT_DIR, cfg.file);
    const existing = fs.existsSync(p) ? countWords(fs.readFileSync(p, 'utf8')) : 0;
    if (existing >= cfg.target) {
      console.log(`SKIP ${cfg.file}: already ${existing}/${cfg.target} words`);
      continue;
    }
    const r = await generateOne(cfg);
    const missing = validate(fs.readFileSync(p, 'utf8'));
    console.log(
      `DONE ${r.file}: ${r.words} words${missing.length ? ' | MISSING: ' + missing.join(',') : ''}`
    );
  }
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
