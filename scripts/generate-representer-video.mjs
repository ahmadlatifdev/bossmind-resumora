#!/usr/bin/env node
/**
 * generate-representer-video.mjs — 1-minute CINEMATIC brand spokesperson video.
 * Strategy (BossMind pipeline parity):
 *   - Edge-TTS voiceover (EN/FR/ES, professional male voices)
 *   - 3D-shaded character + Ken Burns motion + vignette + color grade
 *   - navy (#0a1a3a) + gold (#d4af37) luxury grade
 * Output: artifacts/representer/resumora-representer.mp4 (1080x1920@30, H.264 + AAC).
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = 'D:/BossMind/bossmind-resumora';
const OUT = path.join(ROOT, 'artifacts', 'representer');
const VOICE = path.join(OUT, 'voice');
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

// ---------------------------------------------------------------- 60s ambient bed (original)
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
function fadeOut(start, end, dur = 0.7) {
  return `if(lt(t,${end - dur}),1,if(lt(t,${end}),(t-(${end - dur}))/${-dur}+1,0))`;
}
function alpha(start, end, fi = 0.7, fo = 0.7) {
  // fade in at start, hold, fade out before end
  return `if(lt(t,${start}),0,if(lt(t,${start + fi}),(t-${start})/${fi},if(lt(t,${end - fo}),1,if(lt(t,${end}),(${end}-t)/${fo},0))))`;
}

function drawText({ text, y, fontsize, color, enable = '1', a = '1' }) {
  return (
    `drawtext=fontfile=${FONT_REL}:text='${text}':fontcolor=${color}:fontsize=${fontsize}:` +
    `x=(w-text_w)/2:y=${y}:alpha='${a}':enable='${enable}'`
  );
}

// ---------------------------------------------------------------- timeline (synced to voiceover)
const messages = [
  { s: 3.0, e: 17.5, text: "Your résumé. Your next chapter.", tag: 'EN' },
  { s: 18.0, e: 32.5, text: "Votre CV. Un nouveau départ.", tag: 'FR' },
  { s: 33.0, e: 47.5, text: "Tu currículum. Tu próximo capítulo.", tag: 'ES' },
];

const f = [];
f.push('[0:v]scale=1080:1920,setsar=1[bg]');

// character: Ken Burns slow zoom (640 → 820) + gentle vertical drift + fade in
f.push(
  "[1:v]scale=w='trunc(640+180*t/60)':h='trunc(640+180*t/60)':eval=frame," +
  "format=rgba,fade=t=in:st=0.4:d=1.8:alpha=1[char]"
);
f.push("[bg][char]overlay=(W-w)/2:350+14*sin(t/9):format=auto[b1]");

// title (persistent, gold)
f.push(
  `[b1]` + drawText({ text: 'RESUMORA', y: 150, fontsize: 90, color: GOLD, a: fadeAlpha(0.4, 1.2) }) + `[t0]`
);

// 3 sentences + language tags
let prev = 't0';
messages.forEach((m, i) => {
  const label = `m${i}`;
  f.push(
    `[${prev}]` +
      drawText({ text: m.text, y: 1240, fontsize: 52, color: WHITE, enable: `between(t,${m.s},${m.e})`, a: alpha(m.s, m.e) }) +
      `[${label}]`
  );
  f.push(
    `[${label}]` +
      drawText({ text: m.tag, y: 1152, fontsize: 34, color: GOLD, enable: `between(t,${m.s},${m.e})`, a: alpha(m.s, m.e) }) +
      `[tag${i}]`
  );
  prev = `tag${i}`;
});

// gold divider
f.push(`[${prev}]drawbox=x=440:y=1330:w=200:h=4:color=${GOLD}:t=fill:enable='between(t,3,47.5)'[d1]`);

// CTA + url
f.push(
  `[d1]` + drawText({ text: 'resumora.net', y: 1520, fontsize: 56, color: GOLD, enable: 'between(t,49,60)', a: fadeAlpha(49) }) + `[c1]`
);

// cinematic grade
f.push(`[c1]vignette=PI/4,eq=contrast=1.06:saturation=1.12,format=yuv420p[v]`);

// ---------------------------------------------------------------- audio: ambient bed + 3 voiceovers
const a = [];
a.push('[2:a]lowpass=f=720,volume=0.10[bed]');
a.push('[3:a]adelay=3000:all=1[en]');
a.push('[4:a]adelay=18000:all=1[fr]');
a.push('[5:a]adelay=33000:all=1[es]');
a.push('[bed][en][fr][es]amix=inputs=4:duration=longest:normalize=0,afade=t=out:st=57:d=3[a]');

const filter = f.join(';') + ';' + a.join(';');
const out = path.join(OUT, 'resumora-representer.mp4');

execFileSync('ffmpeg', [
  '-y',
  '-f', 'lavfi', '-i', `color=c=${NAVY}:s=${W}x${H}:d=${D}:r=30`,
  '-loop', '1', '-t', String(D), '-i', CHAR,
  '-i', AMBIENT,
  '-i', path.join(VOICE, 'en.mp3'),
  '-i', path.join(VOICE, 'fr.mp3'),
  '-i', path.join(VOICE, 'es.mp3'),
  '-filter_complex', filter,
  '-map', '[v]', '-map', '[a]',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
  '-movflags', '+faststart',
  '-t', String(D),
  out,
]);

console.log('CREATED', out);
