#!/usr/bin/env node
/**
 * Master orchestrator for the conversational interview video pipeline.
 *
 * Steps:
 *   1. generate_audio.py   — Edge-TTS per-speaker MP3s
 *   2. generate_avatars.py — MultiTalk lip-sync (prints TODOs; heavy GPU step)
 *   3. remotion render     — Word-Pop subtitle overlay
 *   4. Collect final MP4s  — pipeline/outputs/
 *
 * Heavy steps (MultiTalk inference, Remotion install, Whisper) are NOT run here
 * automatically; they print clear TODOs. This orchestrator wires everything that
 * can be run without GPU/model weights and documents the rest.
 *
 * Usage:
 *   node pipeline/build_interviews.js
 */

import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PIPELINE_DIR = path.resolve(__dirname, '..');
const ASSETS = path.join(PIPELINE_DIR, 'assets');
const OUTPUTS = path.join(PIPELINE_DIR, 'outputs');
const REMOTION_DIR = path.join(PIPELINE_DIR, 'remotion-editor');

const ROLES = ['software_engineer', 'data_scientist', 'product_manager', 'marketing_manager'];

function run(cmd, args, opts = {}) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: opts.cwd || PIPELINE_DIR,
    shell: false,
  });
  if (res.status !== 0) {
    if (!opts.allowFailure) {
      console.error(`[ERROR] command failed: ${cmd} ${args.join(' ')}`);
      process.exit(1);
    }
    console.warn(`[WARN] command exited ${res.status} (continuing): ${cmd}`);
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function main() {
  ensureDir(OUTPUTS);
  ensureDir(path.join(OUTPUTS, 'avatars'));

  // 1. Audio (Edge-TTS).
  run('python', [path.join(PIPELINE_DIR, 'scripts', 'generate_audio.py')]);

  // 2. MultiTalk avatars (validates env + prints TODOs; never auto-runs GPU inference).
  run('python', [path.join(PIPELINE_DIR, 'scripts', 'generate_avatars.py')], {
    allowFailure: true,
  });

  // 3. Remotion. TODO: install once (`cd pipeline/remotion-editor && npm install`).
  if (!fs.existsSync(path.join(REMOTION_DIR, 'node_modules'))) {
    console.warn('\n[WARN] Remotion deps not installed. Run:');
    console.warn('  cd pipeline/remotion-editor && npm install');
  } else {
    console.warn('\n[TODO] Remotion render requires Whisper word timestamps.');
    console.warn('  See pipeline/remotion-editor/README.md for the render command.');
  }

  // 4. Report expected outputs.
  console.log('\nExpected outputs:');
  for (const role of ROLES) {
    console.log(`  ${path.join(OUTPUTS, role + '.mp4')}`);
  }
  console.log('\nPipeline orchestration finished (heavy steps are TODO — see logs above).');
}

main();
