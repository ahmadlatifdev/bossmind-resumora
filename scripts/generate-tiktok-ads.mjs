#!/usr/bin/env node
/**
 * generate-tiktok-ads.mjs — reproducible renderer for the Resumora luxury TikTok ads.
 * Produces three 15s portrait (1080x1920@30) MP4s (EN/FR/ES) + cover images + captions,
 * using only FFmpeg + local assets + an original generated ambient track. Zero external cost.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = 'D:/BossMind/bossmind-resumora';
const OUT = path.join(ROOT, 'artifacts/tiktok-ads');
const LOGO = path.join(ROOT, 'public/resumora-logo.png');
const FONT_SRC = 'C:/Windows/Fonts/georgia.ttf';
const FONT = path.join(OUT, 'georgia.ttf');
const FONT_REL = 'artifacts/tiktok-ads/georgia.ttf'; // no drive colon → safe in ffmpeg filter

mkdirSync(OUT, { recursive: true });
if (!existsSync(FONT)) copyFileSync(FONT_SRC, FONT);

const W = 1080, H = 1920;
const NAVY = '0x0a1a3a';
const GOLD = '0xd4af37';

// ---------------------------------------------------------------- copy
const COPY = {
  en: {
    lines: [
      'Your résumé.',
      'Your next chapter.',
      'Your story. Beautifully presented.',
      'Present yourself with confidence.',
    ],
    cta: 'DISCOVER RESUMORA',
    url: 'resumora.net',
    caption: 'Your résumé. Your next chapter. Your story, beautifully presented. ✨ #resumora #resume #career #jobsearch',
  },
  fr: {
    lines: [
      'Votre CV.',
      'Un nouveau départ.',
      'Votre parcours. Présenté avec élégance.',
      'Présentez-vous avec assurance.',
    ],
    cta: 'DÉCOUVREZ RESUMORA',
    url: 'resumora.net',
    caption: 'Votre CV. Un nouveau départ. Votre parcours, présenté avec élégance. ✨ #resumora #cv #carriere #emploi',
  },
  es: {
    lines: [
      'Tu currículum.',
      'Tu próximo capítulo.',
      'Tu historia. Presentada con elegancia.',
      'Preséntate con confianza.',
    ],
    cta: 'DESCUBRE RESUMORA',
    url: 'resumora.net',
    caption: 'Tu currículum. Tu próximo capítulo. Tu historia, presentada con elegancia. ✨ #resumora #cv #carrera #empleo',
  },
};

// ---------------------------------------------------------------- audio (original ambient)
const AMBIENT = path.join(OUT, 'ambient.wav');
if (!existsSync(AMBIENT)) {
  execFileSync('ffmpeg', [
    '-y',
    '-f', 'lavfi', '-i', 'sine=frequency=220:duration=15',
    '-f', 'lavfi', '-i', 'sine=frequency=277.18:duration=15',
    '-f', 'lavfi', '-i', 'sine=frequency=329.63:duration=15',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=15',
    '-filter_complex',
    '[0:a][1:a][2:a][3:a]amix=inputs=4,lowpass=f=720,volume=0.16,afade=t=in:st=0:d=2.5,afade=t=out:st=11.5:d=3.5[a]',
    '-map', '[a]', '-c:a', 'pcm_s16le', AMBIENT,
  ]);
}

function fadeAlpha(start, dur = 0.4) {
  // 0 before start, ramp to 1 over dur seconds
  return `if(lt(t,${start}),0,if(lt(t,${start + dur}),(t-${start})/${dur},1))`;
}

function drawText({ text, y, fontsize, color, enable, alpha = '1', font = FONT_REL }) {
  return (
    `drawtext=fontfile=${font}:text='${text}':` +
    `fontcolor=${color}:fontsize=${fontsize}:` +
    `x=(w-text_w)/2:y=${y}:alpha='${alpha}':enable='${enable}'`
  );
}

function buildFilter(c) {
  const f = [];
  // background
  f.push('[0:v]scale=1080:1920,setsar=1[bg]');
  // logo (visible throughout, subtle fade-in)
  f.push('[1:v]scale=280:359,format=rgba,fade=t=in:st=0.3:d=1.0:alpha=1[logo]');
  f.push(`[bg][logo]overlay=(W-w)/2:130:format=auto[b0]`);

  // four storytelling lines (center, sequential gentle fades)
  const yLine = 760;
  const segs = [
    { s: 1.2, e: 3.5 },
    { s: 3.5, e: 5.6 },
    { s: 5.6, e: 7.6 },
    { s: 7.6, e: 9.8 },
  ];
  let prev = 'b0';
  c.lines.forEach((line, i) => {
    const { s, e } = segs[i];
    const label = `t${i}`;
    f.push(
      `[${prev}]` +
        drawText({
          text: line,
          y: yLine,
          fontsize: 64,
          color: '0xffffff',
          enable: `between(t,${s},${e})`,
          alpha: fadeAlpha(s),
        }) +
        `[${label}]`
    );
    prev = label;
  });

  // résumé illustration (stylized document) — appears from 7.6s
  const cx = (W - 400) / 2;
  const paperY = 1160;
  f.push(
    `[${prev}]drawbox=x=${cx}:y=${paperY}:w=400:h=440:color=0xffffff@0.08:t=fill:enable='gte(t,7.6)',` +
      `drawbox=x=${cx + 20}:y=${paperY + 50}:w=360:h=6:color=${GOLD}:t=fill:enable='gte(t,7.6)',` +
      `drawbox=x=${cx + 20}:y=${paperY + 110}:w=300:h=5:color=0xffffff@0.35:t=fill:enable='gte(t,7.6)',` +
      `drawbox=x=${cx + 20}:y=${paperY + 150}:w=340:h=5:color=0xffffff@0.28:t=fill:enable='gte(t,7.6)',` +
      `drawbox=x=${cx + 20}:y=${paperY + 190}:w=260:h=5:color=0xffffff@0.28:t=fill:enable='gte(t,7.6)',` +
      `drawbox=x=${cx + 20}:y=${paperY + 230}:w=320:h=5:color=0xffffff@0.35:t=fill:enable='gte(t,7.6)',` +
      `drawbox=x=${cx + 20}:y=${paperY + 270}:w=180:h=5:color=0xffffff@0.28:t=fill:enable='gte(t,7.6)'[ill]`
  );

  // CTA + url (visible >= 4s)
  f.push(
    `[ill]` +
      drawText({
        text: c.cta,
        y: 1740,
        fontsize: 66,
        color: GOLD,
        enable: 'between(t,9.8,15)',
        alpha: fadeAlpha(9.8),
      }) +
      `[cta]`
  );
  f.push(
    `[cta]` +
      drawText({
        text: c.url,
        y: 1830,
        fontsize: 42,
        color: '0xffffff',
        enable: 'between(t,10.6,15)',
        alpha: fadeAlpha(10.6),
      }) +
      `,format=yuv420p[v]`
  );

  return f.join(';');
}

for (const lang of ['en', 'fr', 'es']) {
  const c = COPY[lang];
  const out = path.join(OUT, `resumora-luxury-${lang.toUpperCase()}.mp4`);
  const filter = buildFilter(c);
  execFileSync('ffmpeg', [
    '-y',
    '-f', 'lavfi', '-i', `color=c=${NAVY}:s=${W}x${H}:d=15:r=30`,
    '-loop', '1', '-t', '15', '-i', LOGO,
    '-i', AMBIENT,
    '-filter_complex', filter,
    '-map', '[v]', '-map', '2:a',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
    '-movflags', '+faststart',
    '-t', '15',
    out,
  ]);

  // cover image (frame at 10.5s, where CTA is up)
  const cover = path.join(OUT, `resumora-luxury-${lang.toUpperCase()}-cover.png`);
  execFileSync('ffmpeg', ['-y', '-i', out, '-vf', 'select=eq(n\\,315)', '-frames:v', '1', '-update', '1', cover]);

  // caption text file
  writeFileSync(path.join(OUT, `resumora-luxury-${lang.toUpperCase()}-caption.txt`), c.caption + '\n', 'utf8');

  console.log('CREATED', path.basename(out));
}

console.log('DONE');
