#!/usr/bin/env node
/**
 * Render final interview videos with pure FFmpeg (no React/Remotion).
 *
 * For each role: loop the static navy background, burn the .srt subtitles in
 * gold, and mux the combined audio into a 1080p MP4.
 *
 * Runs from pipeline/ so all paths are relative (avoids Windows drive-letter
 * escaping issues in the subtitles filter).
 *
 * Usage: node pipeline/scripts/render_ffmpeg.js [role ...]
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PIPELINE_DIR = path.resolve(__dirname, '..');

const BACKGROUND = path.join('..', 'assets', 'resumora-solid-bg.png');
const AUDIO_DIR = path.join('assets', 'audio');
const TRANSCRIPTS_DIR = path.join('assets', 'transcripts');
const OUTPUTS_DIR = 'outputs';

const ROLES = ['software_engineer', 'data_scientist', 'product_manager', 'marketing_manager'];

// ASS style: gold #D4AF37 = BGR &H0037AFD4 (note BGR byte order, not RGB).
const FORCE_STYLE =
  'FontName=Arial,FontSize=24,PrimaryColour=&H0037AFD4,OutlineColour=&H00000000,' +
  'BackColour=&H80000000,BorderStyle=1,Outline=1,Shadow=1,MarginV=50';

function renderRole(role) {
  const audio = path.join(AUDIO_DIR, `${role}_combined.mp3`);
  const srt = path.join(TRANSCRIPTS_DIR, `${role}_combined.srt`);
  const output = path.join(OUTPUTS_DIR, `${role}.mp4`);

  if (!fs.existsSync(path.join(PIPELINE_DIR, audio))) {
    console.warn(`[WARN] ${role}: missing audio ${audio}`);
    return false;
  }
  if (!fs.existsSync(path.join(PIPELINE_DIR, srt))) {
    console.warn(`[WARN] ${role}: missing subtitles ${srt} — run json_to_srt.py first`);
    return false;
  }

  fs.mkdirSync(path.join(PIPELINE_DIR, OUTPUTS_DIR), { recursive: true });

  const args = [
    '-y',
    '-loop',
    '1',
    '-i',
    BACKGROUND,
    '-i',
    audio,
    '-vf',
    `subtitles=${srt}:force_style='${FORCE_STYLE}'`,
    '-c:v',
    'libx264',
    '-tune',
    'stillimage',
    '-r',
    '30',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-shortest',
    '-pix_fmt',
    'yuv420p',
    output,
  ];

  console.log(`\n[RENDER] ${role}`);
  console.log(`$ ffmpeg ${args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}`);

  const res = spawnSync('ffmpeg', args, { stdio: 'inherit', cwd: PIPELINE_DIR, shell: false });
  if (res.status !== 0) {
    console.error(`[ERROR] ffmpeg failed for ${role} (exit ${res.status})`);
    return false;
  }
  const outAbs = path.join(PIPELINE_DIR, output);
  console.log(`[OK] ${outAbs} (${fs.existsSync(outAbs) ? fs.statSync(outAbs).size : 0} bytes)`);
  return fs.existsSync(outAbs);
}

function main() {
  const requested = process.argv.slice(2);
  const roles = requested.length ? requested : ROLES;

  let ok = 0;
  for (const role of roles) {
    if (renderRole(role)) ok += 1;
  }
  console.log(`\nDone. ${ok}/${roles.length} video(s) rendered.`);
  if (ok < roles.length) process.exitCode = 1;
}

main();
