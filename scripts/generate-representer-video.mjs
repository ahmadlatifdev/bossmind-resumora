#!/usr/bin/env node
/**
 * generate-representer-video.mjs — 1-minute professional brand spokesperson video.
 * Zero-cost: FFmpeg + a rendered SVG character + Georgia serif + generated ambient audio.
 * Output: artifacts/representer/resumora-representer.mp4 (1080x1920@30, H.264 + AAC).
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = 'D:/BossMind/bossmind-resumora';
const OUT = path.join(ROOT, 'artifacts', 'representer');
const CHAR = path.join(OUT, 'character.jpeg');
const FONT_SRC = 'C:/Windows/Fonts/georgia.ttf';
const FONT = path.join(OUT, 'georgia.ttf');
const FONT_REL = 'artifacts/representer/georgia.ttf'; // no drive colon → safe in ffmpeg filter

mkdirSync(OUT, { recursive: true });
if (!existsSync(FONT)) copyFileSync(FONT_SRC, FONT);

const W = 1080, H = 1920, D = 60;
const NAVY = '0x0a1a3a';
const GOLD = '0xd4af37';
const WHITE = '0xffffff';

// ---------------------------------------------------------------- 60s ambient audio (original)
const AMBIENT = path.join(OUT, 'ambient60.wav');
if (!existsSync(AMBIENT)) {
  execFileSync('ffmpeg', [
    '-y',
    '-f', 'lavfi', '-i', 'sine=frequency=220:duration=60',
    '-f', 'lavfi', '-i', 'sine=frequency=277.18:duration=60',
    '-f', 'lavfi', '-i', 'sine=frequency=329.63:duration=60',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=60',
    '-filter_complex',
    '[0:a][1:a][2:a][3:a]amix=inputs=4,lowpass=f=720,volume=0.14,afade=t=in:st=0:d=2.5,afade=t=out:st=56:d=4[a]',
    '-map', '[a]', '-c:a', 'pcm_s16le', AMBIENT,
  ]);
}

function fadeAlpha(start, dur = 0.6) {
  return `if(lt(t,${start}),0,if(lt(t,${start + dur}),(t-${start})/${dur},1))`;
}

function drawText({ text, y, fontsize, color, enable = '1', alpha = '1' }) {
  return (
    `drawtext=fontfile=${FONT_REL}:text='${text}':fontcolor=${color}:fontsize=${fontsize}:` +
    `x=(w-text_w)/2:y=${y}:alpha='${alpha}':enable='${enable}'`
  );
}

// ---------------------------------------------------------------- timeline
const messages = [
  { s: 2.5, e: 9.0, text: "Your résumé." },
  { s: 9.0, e: 15.5, text: "Your next chapter." },
  { s: 15.5, e: 23.0, text: "Your story. Beautifully presented." },
  { s: 23.0, e: 30.5, text: "Present yourself with confidence." },
  { s: 30.5, e: 39.0, text: "AI resumes and interview mastery." },
];

const f = [];
f.push('[0:v]scale=1080:1920,setsar=1[bg]');

// character: 1310x1310 → 700x700, gentle zoom + fade in
f.push(
  "[1:v]scale=w='trunc(680+8*t)':h='trunc(680+8*t)':eval=frame," +
  "format=rgba,fade=t=in:st=0.4:d=1.6:alpha=1[char]"
);
f.push('[bg][char]overlay=(W-w)/2:360:format=auto[b1]');

// title (always)
f.push(
  `[b1]` + drawText({ text: 'RESUMORA', y: 160, fontsize: 92, color: GOLD, alpha: fadeAlpha(0.4, 1.0) }) + `[t0]`
);

// rotating messages
let prev = 't0';
messages.forEach((m, i) => {
  const label = `m${i}`;
  f.push(
    `[${prev}]` +
      drawText({
        text: m.text,
        y: 1240,
        fontsize: 54,
        color: WHITE,
        enable: `between(t,${m.s},${m.e})`,
        alpha: fadeAlpha(m.s),
      }) +
      `[${label}]`
  );
  prev = label;
});

// divider accent (gold line) under messages
f.push(`[${prev}]drawbox=x=440:y=1330:w=200:h=4:color=${GOLD}:t=fill:enable='between(t,2.5,39)'[d1]`);

// CTA
f.push(
  `[d1]` + drawText({ text: 'DISCOVER RESUMORA', y: 1500, fontsize: 64, color: GOLD, enable: 'between(t,41,52)', alpha: fadeAlpha(41) }) + `[c1]`
);
// url
f.push(
  `[c1]` + drawText({ text: 'resumora.net', y: 1610, fontsize: 48, color: WHITE, enable: 'between(t,52,60)', alpha: fadeAlpha(52) }) + `,format=yuv420p[v]`
);

const filter = f.join(';');
const out = path.join(OUT, 'resumora-representer.mp4');

execFileSync('ffmpeg', [
  '-y',
  '-f', 'lavfi', '-i', `color=c=${NAVY}:s=${W}x${H}:d=${D}:r=30`,
  '-loop', '1', '-t', String(D), '-i', CHAR,
  '-i', AMBIENT,
  '-filter_complex', filter,
  '-map', '[v]', '-map', '2:a',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
  '-movflags', '+faststart',
  '-t', String(D),
  out,
]);

console.log('CREATED', out);
