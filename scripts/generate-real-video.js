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

const FLUX_MODEL = 'black-forest-labs/flux-1.1-pro';
const TTS_MODEL = 'minimax/speech-02-hd';
const WAN_MODEL = 'wan-video/wan-2.2-s2v';
const WAN_VERSION = '09607e6e761d2f015b0d740f938ec59199f54aa623384465a5054b230405acf4';

const AVATAR_PATH = path.join(ROOT, 'assets', 'avatar.png');
const AUDIO_PATH = path.join(ROOT, 'assets', 'star-behavioral-audio.mp3');
const BUILD_DIR = path.join(ROOT, 'assets', 'star-build');
const OUTPUT_PATH = path.join(ROOT, 'resumora_cinematic_Data_Scientist_EN.mp4');
const R2_PATH = 'r2:resumora-videos/resumora_cinematic_Data_Scientist_EN.mp4';

const SEGMENT_SECONDS = 30;

const AVATAR_PROMPT =
  'Photorealistic portrait of a confident professional woman in her early 30s, facing the camera directly with a neutral, friendly closed-mouth expression, head and shoulders framing, wearing a tailored charcoal blazer over a crisp white shirt, seated in a bright modern glass-walled office, soft cinematic key lighting with gentle shadows, shallow depth of field, blurred office background, ultra-detailed skin texture, photorealistic 8k cinematic quality';

const INTERVIEW_TEXT =
  'Welcome to Behavioral and STAR Method Excellence. In a behavioral interview, employers ask you to share real examples from your past, because past behavior is the best predictor of future performance. The STAR method gives you a clear structure to answer with confidence. STAR stands for Situation, Task, Action, and Result. First, describe the Situation and set the scene. Next, explain the Task you were responsible for. Then walk through the specific Actions you personally took, step by step. Finally, share the Result, and quantify your impact with numbers whenever possible. Prepare four or five versatile stories you can adapt to different questions, and always connect your answer back to the role you want. With practice, the STAR method turns your experience into a compelling story that proves you are the right hire. This is the Resumora behavioral interview framework. Use it to shine in your next interview.';

const WAN_PROMPT =
  'A professional woman speaking directly to the camera, natural head movements and clear lip sync, seated in a modern glass-walled office, cinematic lighting';

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

async function main() {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token || token === 'PASTE_YOUR_KEY_HERE') {
    console.error('Error: REPLICATE_API_TOKEN is not set. Open .env.replicate and paste your key.');
    process.exit(1);
  }

  const replicate = new Replicate({ auth: token, useFileOutput: false });

  await mkdir(BUILD_DIR, { recursive: true });

  if (await fileExists(AVATAR_PATH)) {
    console.log(`[1/5] Reusing existing avatar at ${AVATAR_PATH}`);
  } else {
    console.log('[1/5] Generating 3D cinematic avatar with FLUX 1.1 Pro ...');
    const imageOut = await replicate.run(FLUX_MODEL, {
      input: { prompt: AVATAR_PROMPT, aspect_ratio: '1:1', output_format: 'png' },
    });
    const imageUrl = extractUrl(imageOut);
    if (!imageUrl) throw new Error('FLUX returned no image.');
    await downloadToFile(imageUrl, AVATAR_PATH);
    console.log(`   Saved avatar to ${AVATAR_PATH}`);
  }

  if (await fileExists(AUDIO_PATH)) {
    console.log(`[2/5] Reusing existing interview audio at ${AUDIO_PATH}`);
  } else {
    console.log('[2/5] Generating ~60s interview audio with minimax/speech-02-hd ...');
    const ttsOut = await replicate.run(TTS_MODEL, {
      input: {
        text: INTERVIEW_TEXT,
        voice_id: 'English_Wiselady',
        emotion: 'auto',
        speed: 1,
        audio_format: 'mp3',
      },
    });
    const audioUrl = extractUrl(ttsOut);
    if (!audioUrl) throw new Error('TTS returned no audio.');
    await downloadToFile(audioUrl, AUDIO_PATH);
    console.log(`   Saved audio to ${AUDIO_PATH}`);
  }

  const duration = await getDurationSec(AUDIO_PATH);
  console.log(
    `[3/5] Audio duration: ${duration.toFixed(1)}s — splitting into <=30s segments if needed`
  );
  const audioSegments = await splitAudio(AUDIO_PATH, BUILD_DIR);
  console.log(`   ${audioSegments.length} segment(s)`);

  const imageDataUri = await fileToDataUri(AVATAR_PATH);
  const videoPaths = [];
  for (let i = 0; i < audioSegments.length; i += 1) {
    const segVideo = path.join(BUILD_DIR, `video_${String(i).padStart(3, '0')}.mp4`);
    console.log(
      `[4/5] Running wan-2.2-s2v on segment ${i + 1}/${audioSegments.length} (${audioSegments[i]}) ...`
    );
    const videoOut = await replicate.run(`${WAN_MODEL}:${WAN_VERSION}`, {
      input: {
        image: imageDataUri,
        audio: await fileToDataUri(audioSegments[i]),
        prompt: WAN_PROMPT,
      },
    });
    const videoUrl = extractUrl(videoOut);
    if (!videoUrl) throw new Error('wan-2.2-s2v returned no video.');
    await downloadToFile(videoUrl, segVideo);
    console.log(`   Segment ${i + 1} saved to ${segVideo}`);
    videoPaths.push(segVideo);
  }

  console.log(`[5/5] Stitching ${videoPaths.length} clip(s) -> ${OUTPUT_PATH}`);
  await concatVideos(videoPaths, OUTPUT_PATH, BUILD_DIR);
  console.log(`   Saved final video to ${OUTPUT_PATH}`);

  console.log(`Uploading to ${R2_PATH} ...`);
  const { stderr } = await exec('rclone', ['copyto', OUTPUT_PATH, R2_PATH]);
  if (stderr.trim()) console.log(stderr.trim());
  console.log(`Upload complete: ${R2_PATH}`);
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
