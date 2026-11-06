#!/usr/bin/env node
/**
 * Master orchestrator for the conversational interview video pipeline (HeyGen).
 *
 *   1. generate_audio.py   — Edge-TTS → per-speaker MP3s
 *   2. heygen_pipeline.js  — upload audio → HeyGen avatar → poll → download → Firebase
 *
 * Final outputs: pipeline/outputs/<role>.mp4 (+ uploaded to Firebase Storage)
 *
 * Usage: node pipeline/build_interviews.js
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PIPELINE_DIR = path.resolve(__dirname, '..');
const OUTPUTS = path.join(PIPELINE_DIR, 'outputs');

function run(cmd, args, opts = {}) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: opts.cwd || PIPELINE_DIR,
    shell: false,
  });
  if (res.status !== 0) {
    console.error(`[ERROR] command failed (exit ${res.status}): ${cmd} ${args.join(' ')}`);
    process.exit(1);
  }
}

function main() {
  fs.mkdirSync(OUTPUTS, { recursive: true });

  // 1. Audio (Edge-TTS).
  run('python', [path.join(PIPELINE_DIR, 'scripts', 'generate_audio.py')]);

  // 2. HeyGen avatar generation + Firebase upload.
  run('node', [path.join(PIPELINE_DIR, 'scripts', 'heygen_pipeline.js')]);

  console.log(`\nDone. Final videos in ${OUTPUTS}`);
}

main();
