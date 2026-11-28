#!/usr/bin/env node
/**
 * generate-representer-video.mjs — 1-minute cinematic brand spokesperson video.
 * 3D-shaded character + dynamic zoom + vignette + color grade.
 * Content: 3 short sentences in EN / FR / ES + resumora.net CTA.
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
const FONT_REL = 'artifacts/representer/georgia.ttf';

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

function fadeAlpha(start, dur = 0.7) {
  return `if(lt(t,${start}),0,if(lt(t,${start + dur}),(t-${start})/${dur},1))`;
}

function drawText({ text, y, fontsize, color, enable = '1', alpha = '1' }) {
  return (
    `drawtext=fontfile=${FONT_REL}:text='${text}':fontcolor=${color}:fontsize=${fontsize}:` +
    `x=(w-text_w)/2:y=${y}:alpha='${alpha}':enable='${enable}'`
  );
}

// ---------------------------------------------------------------- 3 sentences (EN/FR/ES)
const messages = [
  { s: 3.0, e: 19.0, text: "Your résumé. Your next chapter." },
  { s: 19.0, e: 35.0, text: "Votre CV. Un nouveau départ." },
  { s: 35.0, e: 51.0, text: "Tu currículum. Tu próximo capítulo." },
];

const f = [];
f.push('[0:v]scale=1080:1920,setsar=1[bg]');

// character: dynamic slow zoom (660 → 780) + fade in
f.push(
  "[1:v]scale=w='trunc(660+120*t/60)':h='trunc(660+120*t/60)':eval=frame," +
  "format=rgba,fade=t=in:st=0.4:d=1.8:alpha=1[char]"
);
f.push('[bg][char]overlay=(W-w)/2:350:format=auto[b1]');

// title (persistent, gold)
f.push(
  `[b1]` + drawText({ text: 'RESUMORA', y: 150, fontsize: 90, color: GOLD, alpha: fadeAlpha(0.4, 1.2) }) + `[t0]`
);

// 3 sentences
let prev = 't0';
messages.forEach((m, i) => {
  const label = `m${i}`;
  f.push(
    `[${prev}]` +
      drawText({
        text: m.text,
        y: 1240,
        fontsize: 52,
        color: WHITE,
        enable: `between(t,${m.s},${m.e})`,
        alpha: fadeAlpha(m.s),
      }) +
      `[${label}]`
  );
  prev = label;
});

// language tag (small gold, shows which language)
f.push(
  `[${prev}]` +
    drawText({ text: 'EN', y: 1160, fontsize: 34, color: GOLD, enable: 'between(t,3,19)', alpha: fadeAlpha(3) }) +
    `[l0]`
);
f.push(
  `[l0]` +
    drawText({ text: 'FR', y: 1160, fontsize: 34, color: GOLD, enable: 'between(t,19,35)', alpha: fadeAlpha(19) }) +
    `[l1]`
);
f.push(
  `[l1]` +
    drawText({ text: 'ES', y: 1160, fontsize: 34, color: GOLD, enable: 'between(t,35,51)', alpha: fadeAlpha(35) }) +
    `[l2]`
);

// gold divider
f.push(`[l2]drawbox=x=440:y=1330:w=200:h=4:color=${GOLD}:t=fill:enable='between(t,3,51)'[d1]`);

// CTA + url
f.push(
  `[d1]` + drawText({ text: 'resumora.net', y: 1520, fontsize: 56, color: GOLD, enable: 'between(t,51,60)', alpha: fadeAlpha(51) }) + `[c1]`
);

// cinematic grade: vignette + contrast/saturation
f.push(`[c1]vignette=PI/4,eq=contrast=1.06:saturation=1.12,format=yuv420p[v]`);

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
