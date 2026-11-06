#!/usr/bin/env node
/**
 * Master orchestrator for the conversational interview video pipeline.
 *
 *   1. generate_audio.py      — Edge-TTS → per-speaker MP3s
 *   2. generate_timestamps.py — Whisper → word-level timestamps (per role)
 *   3. Remotion render        — navy background + audio + Word-Pop → MP4
 *
 * Final outputs: pipeline/outputs/<role>.mp4
 *
 * Usage: node pipeline/build_interviews.js
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PIPELINE_DIR = path.resolve(__dirname, '..');
const ASSETS = path.join(PIPELINE_DIR, 'assets');
const AUDIO_DIR = path.join(ASSETS, 'audio');
const TRANSCRIPTS_DIR = path.join(ASSETS, 'transcripts');
const OUTPUTS = path.join(PIPELINE_DIR, 'outputs');
const REMOTION_DIR = path.join(PIPELINE_DIR, 'remotion-editor');
const REMOTION_PUBLIC = path.join(REMOTION_DIR, 'public', 'audio');

const ROLES = ['software_engineer', 'data_scientist', 'product_manager', 'marketing_manager'];

function run(cmd, args, opts = {}) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: opts.cwd || PIPELINE_DIR,
    shell: false,
  });
  if (res.status !== 0 && !opts.allowFailure) {
    console.error(`[ERROR] command failed: ${cmd} ${args.join(' ')}`);
    process.exit(1);
  }
  if (res.status !== 0) {
    console.warn(`[WARN] command exited ${res.status} (continuing): ${cmd}`);
  }
  return res.status === 0;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function renderRole(role) {
  const transcriptPath = path.join(TRANSCRIPTS_DIR, `${role}_transcript.json`);
  const combinedAudio = path.join(AUDIO_DIR, `${role}_combined.mp3`);

  if (!fs.existsSync(transcriptPath)) {
    console.warn(`[WARN] No transcript for ${role} — run generate_timestamps.py first.`);
    return false;
  }
  if (!fs.existsSync(combinedAudio)) {
    console.warn(`[WARN] No combined audio for ${role}.`);
    return false;
  }

  // Copy the combined audio into Remotion's public/ dir so staticFile() can load it.
  ensureDir(REMOTION_PUBLIC);
  const publicAudioName = `${role}.mp3`;
  fs.copyFileSync(combinedAudio, path.join(REMOTION_PUBLIC, publicAudioName));

  const { words } = JSON.parse(fs.readFileSync(transcriptPath, 'utf8'));
  const props = JSON.stringify({ transcript: words || [], audioFile: `audio/${publicAudioName}` });
  const output = path.join(OUTPUTS, `${role}.mp4`);
  ensureDir(OUTPUTS);

  console.log(`\n[RENDER] ${role} (${(words || []).length} words)`);
  run('npx', ['remotion', 'render', 'InterviewVideo', output, `--props=${props}`], {
    cwd: REMOTION_DIR,
  });
  return fs.existsSync(output);
}

function main() {
  ensureDir(OUTPUTS);

  // 1. Audio (Edge-TTS).
  run('python', [path.join(PIPELINE_DIR, 'scripts', 'generate_audio.py')]);

  // 2. Word timestamps (Whisper).
  run('python', [path.join(PIPELINE_DIR, 'scripts', 'generate_timestamps.py')]);

  // 3. Remotion render per role.
  if (!fs.existsSync(path.join(REMOTION_DIR, 'node_modules'))) {
    console.warn('\n[WARN] Remotion deps missing. Run: cd pipeline/remotion-editor && npm install');
    process.exit(1);
  }

  let ok = 0;
  for (const role of ROLES) {
    if (renderRole(role)) ok += 1;
  }

  console.log(`\nDone. ${ok}/${ROLES.length} video(s) rendered to ${OUTPUTS}`);
}

main();
