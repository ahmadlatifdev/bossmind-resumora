import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir, access, copyFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import dotenv from 'dotenv';
import Replicate from 'replicate';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env.replicate') });

const execFileAsync = promisify(execFile);

const TTS_MODEL = 'minimax/speech-02-hd';
const WAN_MODEL = 'wan-video/wan-2.2-s2v';
const WAN_VERSION = '09607e6e761d2f015b0d740f938ec59199f54aa623384465a5054b230405acf4';

const AVATAR_PATH = path.join(ROOT, 'assets', 'avatar.png');
const SEGMENT_SECONDS = 30;

const WAN_PROMPT =
  'A professional woman speaking directly to the camera, natural head movements and clear lip sync, seated in a modern glass-walled office, cinematic lighting';

const EN_TEXT =
  'Welcome to Behavioral and STAR Method Excellence. In a behavioral interview, employers ask for real examples from your past. The STAR method gives you a clear structure to answer with confidence. STAR stands for Situation, Task, Action, and Result. First, describe the Situation. Next, explain your Task. Then walk through the Actions you took. Finally, share the Result with numbers when possible. Prepare versatile stories and connect every answer back to the role.';

const FR_TEXT =
  "Bienvenue dans la maîtrise des entretiens comportementaux et de la méthode STAR. Lors d'un entretien comportemental, les recruteurs demandent des exemples réels de votre passé. La méthode STAR vous donne une structure claire pour répondre avec confiance. STAR signifie Situation, Tâche, Action et Résultat. D'abord, décrivez la Situation. Ensuite, expliquez votre Tâche. Puis détaillez les Actions que vous avez menées. Enfin, partagez le Résultat avec des chiffres si possible. Préparez des histoires polyvalentes et reliez chaque réponse au poste.";

const ES_TEXT =
  'Bienvenido al dominio de las entrevistas conductuales y del método STAR. En una entrevista conductual, los reclutadores piden ejemplos reales de su pasado. El método STAR le da una estructura clara para responder con confianza. STAR significa Situación, Tarea, Acción y Resultado. Primero, describa la Situación. Luego, explique su Tarea. Después, detalle las Acciones que usted tomó. Por último, comparta el Resultado con cifras si es posible. Prepare historias versátiles y relacione cada respuesta con el puesto.';

const LANGUAGES = [
  {
    code: 'EN',
    languageBoost: 'English',
    text: EN_TEXT,
    outputName: 'resumora_vid-star-behavioral_EN.mp4',
  },
  {
    code: 'FR',
    languageBoost: 'French',
    text: FR_TEXT,
    outputName: 'resumora_vid-star-behavioral_FR.mp4',
  },
  {
    code: 'ES',
    languageBoost: 'Spanish',
    text: ES_TEXT,
    outputName: 'resumora_vid-star-behavioral_ES.mp4',
  },
];

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
};

async function exec(cmd, args) {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      maxBuffer: 64 * 1024 * 1024,
    });
    return { stdout: stdout.toString(), stderr: stderr.toString() };
  } catch (err) {
    const detail = (err.stderr || err.stdout || err.message || '').toString();
    throw new Error(`${cmd} failed: ${detail}`);
  }
}

async function downloadToFile(url, filePath) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed (${res.status} ${res.statusText}): ${url}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(filePath, buffer);
  return filePath;
}

async function fileToDataUri(filePath) {
  const data = await readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
  return `data:${mime};base64,${data.toString('base64')}`;
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function extractUrl(output) {
  if (!output) return '';
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) return extractUrl(output[0]);
  if (typeof output === 'object') {
    return extractUrl(output.url || output.audio || output.output || output.mp4 || output.video);
  }
  return '';
}

async function getDurationSec(filePath) {
  const { stdout } = await exec('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  const value = parseFloat(stdout.trim());
  if (!Number.isFinite(value)) throw new Error(`Could not determine duration of ${filePath}`);
  return value;
}

async function splitAudio(filePath, buildDir) {
  const duration = await getDurationSec(filePath);
  if (duration <= SEGMENT_SECONDS + 0.5) return [filePath];

  const count = Math.ceil(duration / SEGMENT_SECONDS);
  const segments = [];
  for (let i = 0; i < count; i += 1) {
    const start = i * SEGMENT_SECONDS;
    const length = Math.min(SEGMENT_SECONDS, duration - start);
    const outPath = path.join(buildDir, `seg_${String(i).padStart(3, '0')}.mp3`);
    await exec('ffmpeg', [
      '-y',
      '-i',
      filePath,
      '-ss',
      String(start.toFixed(3)),
      '-t',
      String(length.toFixed(3)),
      '-c:a',
      'libmp3lame',
      '-q:a',
      '2',
      outPath,
    ]);
    segments.push(outPath);
  }
  return segments;
}

async function concatVideos(videoPaths, outPath, buildDir) {
  if (videoPaths.length === 1) {
    await copyFile(videoPaths[0], outPath);
    return;
  }
  const listFile = path.join(buildDir, 'concat.txt');
  const list = videoPaths.map((p) => `file '${p.split('\\').join('/')}'`).join('\n');
  await writeFile(listFile, list);
  await exec('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outPath]);
}

async function processLanguage(replicate, lang, imageDataUri) {
  const { code, languageBoost, text, outputName } = lang;
  const audioPath = path.join(ROOT, 'assets', `vid-star-behavioral-audio-${code}.mp3`);
  const buildDir = path.join(ROOT, 'assets', `vid-star-build-${code}`);
  const outputPath = path.join(ROOT, outputName);
  const r2Path = `r2:resumora-videos/${outputName}`;

  await mkdir(buildDir, { recursive: true });

  console.log(`\n===== ${code} =====`);

  if (await fileExists(audioPath)) {
    console.log(`[${code} 1/4] Reusing existing audio at ${audioPath}`);
  } else {
    console.log(`[${code} 1/4] Generating ${code} audio with minimax/speech-02-hd ...`);
    const ttsOut = await replicate.run(TTS_MODEL, {
      input: {
        text,
        voice_id: 'English_Wiselady',
        emotion: 'auto',
        speed: 1,
        audio_format: 'mp3',
        language_boost: languageBoost,
      },
    });
    const audioUrl = extractUrl(ttsOut);
    if (!audioUrl) throw new Error(`TTS (${code}) returned no audio.`);
    await downloadToFile(audioUrl, audioPath);
    console.log(`   Saved audio to ${audioPath}`);
  }

  const duration = await getDurationSec(audioPath);
  console.log(`[${code} 2/4] Audio duration: ${duration.toFixed(1)}s`);
  const audioSegments = await splitAudio(audioPath, buildDir);
  console.log(`   ${audioSegments.length} segment(s)`);

  const videoPaths = [];
  for (let i = 0; i < audioSegments.length; i += 1) {
    const segVideo = path.join(buildDir, `video_${String(i).padStart(3, '0')}.mp4`);
    if (await fileExists(segVideo)) {
      console.log(
        `[${code} 3/4] Segment ${i + 1}/${audioSegments.length} already exists, skipping`
      );
    } else {
      console.log(
        `[${code} 3/4] Running wan-2.2-s2v on segment ${i + 1}/${audioSegments.length} ...`
      );
      const videoOut = await replicate.run(`${WAN_MODEL}:${WAN_VERSION}`, {
        input: {
          image: imageDataUri,
          audio: await fileToDataUri(audioSegments[i]),
          prompt: WAN_PROMPT,
        },
      });
      const videoUrl = extractUrl(videoOut);
      if (!videoUrl) throw new Error(`wan-2.2-s2v (${code}) returned no video.`);
      await downloadToFile(videoUrl, segVideo);
      console.log(`   Segment ${i + 1} saved to ${segVideo}`);
    }
    videoPaths.push(segVideo);
  }

  console.log(`[${code} 4/4] Stitching ${videoPaths.length} clip(s) -> ${outputPath}`);
  await concatVideos(videoPaths, outputPath, buildDir);
  console.log(`   Saved final video to ${outputPath}`);

  console.log(`   Uploading to ${r2Path} ...`);
  const { stderr } = await exec('rclone', ['copyto', outputPath, r2Path]);
  if (stderr.trim()) console.log(stderr.trim());
  console.log(`   Upload complete: ${r2Path}`);
}

async function main() {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token || token === 'PASTE_YOUR_KEY_HERE') {
    console.error('Error: REPLICATE_API_TOKEN is not set. Open .env.replicate and paste your key.');
    process.exit(1);
  }

  const replicate = new Replicate({ auth: token, useFileOutput: false });

  const imageDataUri = await fileToDataUri(AVATAR_PATH);
  console.log(`Using avatar at ${AVATAR_PATH}`);

  for (const lang of LANGUAGES) {
    await processLanguage(replicate, lang, imageDataUri);
  }

  console.log('\nDone. Batch (EN/FR/ES) generated and uploaded.');
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
