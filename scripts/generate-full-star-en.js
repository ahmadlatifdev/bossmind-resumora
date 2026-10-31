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
const AUDIO_PATH = path.join(ROOT, 'assets', 'vid-star-behavioral-full-audio-EN.mp3');
const BUILD_DIR = path.join(ROOT, 'assets', 'vid-star-full-build-EN');
const OUTPUT_PATH = path.join(ROOT, 'resumora_vid-star-behavioral_EN.mp4');
const R2_PATH = 'r2:resumora-videos/resumora_vid-star-behavioral_EN.mp4';

const SEGMENT_SECONDS = 30;

const WAN_PROMPT =
  'A professional woman speaking directly to the camera, natural head movements and clear lip sync, seated in a modern glass-walled office, cinematic lighting';

const FULL_TEXT =
  'Welcome to Behavioral and STAR Method Excellence. This is the complete Resumora masterclass on how to answer behavioral interview questions with confidence and precision. In a behavioral interview, the employer is not just asking about your skills. They are asking for proof. They want real examples from your past, because past behavior is the strongest predictor of future performance. Instead of hypothetical questions like what would you do, they ask things like, tell me about a time when you faced a difficult deadline, or, describe a situation where you disagreed with a colleague. Every one of these questions is an invitation to tell a story, and the STAR method is the framework that turns your experience into a clear, compelling, and convincing story. So what exactly is STAR? STAR is an acronym that stands for Situation, Task, Action, and Result. It is a four step structure that keeps your answer focused, logical, and easy for the interviewer to follow. Let me walk you through each part in detail. The first step is Situation. Here you set the scene. You give just enough context for the interviewer to understand the world you were operating in. Where were you, what was the company or team, and what was the challenge you were facing? Keep this part brief. Ten to fifteen seconds is enough. The goal is not to tell your entire life story. The goal is to create a clear before picture, so that the action you took later feels meaningful. For example, you might say, in my last role as a marketing coordinator, our team was preparing for a major product launch, but our lead designer left unexpectedly two weeks before the deadline. The second step is Task. This is where you clarify your specific responsibility in that situation. What was your role, and what outcome were you expected to deliver? This step is important because it shows the interviewer what you were personally accountable for, rather than what the team as a whole was doing. Using the same example, your task might have been, I was responsible for ensuring the campaign assets were still delivered on time, even with the team short handed. The third step, and the most important one, is Action. This is the heart of your answer. Here you describe the specific things you personally did to address the task. Be concrete. Use verbs. Say I did, not we did. Walk through your decisions step by step, and explain why you made them. For instance, I quickly audited the remaining work, reprioritized the launch assets by impact, and coordinated with a freelance designer to cover the gap. I also set up daily check ins so nothing slipped through the cracks. The interviewer wants to see your thought process, your initiative, and your ownership, so be generous with the details of what you did. The fourth step is Result. This is where you close the loop and prove the value you created. What happened as a result of your actions? Whenever possible, quantify it. Numbers are powerful. We launched on time, and the campaign generated a twenty percent increase in sign ups compared to the previous quarter. If the result was not perfect, that is okay too. Be honest, and then share what you learned. Interviewers respect self awareness. The key is to show that your actions led to a concrete outcome, and that you understand why. Now, here is how to prepare. You should not wait until the interview to think about your stories. Instead, build a bank of four or five versatile stories ahead of time. Choose stories that cover different themes, such as leadership, teamwork, handling conflict, overcoming failure, and driving results. Write each story down using the STAR structure, and then practice telling it out loud until it feels natural. Aim for about two minutes per story, and be ready to adapt each one to slightly different questions. One good story can often answer several different behavioral questions. A common question you should definitely prepare for is, what is your greatest weakness. Many people struggle with this one. The trap is to give a humble brag like, I work too hard. Instead, choose a real but manageable weakness, and frame it around the actions you are taking to improve. For example, I used to struggle with delegating, because I wanted everything done perfectly. I have been working on that by trusting my team with more ownership and setting clearer expectations. This shows honesty, self awareness, and growth, which is exactly what the interviewer is looking for. Another common theme is conflict. When you describe a disagreement with a colleague, always stay respectful. Focus on the facts, and emphasize how you communicated, listened, and found a solution that worked for both sides. Never blame the other person. The story should demonstrate your emotional intelligence, not your ability to win an argument. Finally, a few practical tips for the interview itself. First, listen carefully to the question, and make sure you are answering the specific scenario they asked about. Second, keep your answers structured and concise. The STAR method naturally helps with this. Third, use positive, confident body language, maintain eye contact, and smile. Fourth, end each answer by connecting it back to the role you are applying for, so the interviewer can see exactly why your experience matters for this job. Let me give you a quick recap. Behavioral questions are asking for proof, and STAR is the structure that delivers it. Situation sets the scene, Task defines your responsibility, Action shows what you personally did, and Result proves the impact. Prepare a bank of four or five versatile stories, practice them out loud, and always connect your answers back to the role. This is the Resumora Behavioral and STAR Method framework. Master it, and you will walk into your next interview with calm, clear, and compelling answers. Good luck, and go get that offer.';

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
  const count = Math.max(1, Math.ceil(duration / SEGMENT_SECONDS));
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

  if (await fileExists(AUDIO_PATH)) {
    console.log(`[1/4] Reusing existing audio at ${AUDIO_PATH}`);
  } else {
    console.log('[1/4] Generating ~8min EN audio with minimax/speech-02-hd ...');
    const ttsOut = await replicate.run(TTS_MODEL, {
      input: {
        text: FULL_TEXT,
        voice_id: 'English_Wiselady',
        emotion: 'auto',
        speed: 1,
        audio_format: 'mp3',
        language_boost: 'English',
      },
    });
    const audioUrl = extractUrl(ttsOut);
    if (!audioUrl) throw new Error('TTS returned no audio.');
    await downloadToFile(audioUrl, AUDIO_PATH);
    console.log(`   Saved audio to ${AUDIO_PATH}`);
  }

  const duration = await getDurationSec(AUDIO_PATH);
  console.log(`[2/4] Audio duration: ${duration.toFixed(1)}s`);
  const audioSegments = await splitAudio(AUDIO_PATH, BUILD_DIR);
  console.log(`   ${audioSegments.length} segment(s)`);

  const imageDataUri = await fileToDataUri(AVATAR_PATH);

  const videoPaths = [];
  for (let i = 0; i < audioSegments.length; i += 1) {
    const segVideo = path.join(BUILD_DIR, `video_${String(i).padStart(3, '0')}.mp4`);
    if (await fileExists(segVideo)) {
      console.log(`[3/4] Segment ${i + 1}/${audioSegments.length} already exists, skipping`);
    } else {
      console.log(`[3/4] Running wan-2.2-s2v on segment ${i + 1}/${audioSegments.length} ...`);
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
    }
    videoPaths.push(segVideo);
  }

  console.log(`[4/4] Stitching ${videoPaths.length} clip(s) -> ${OUTPUT_PATH}`);
  await concatVideos(videoPaths, OUTPUT_PATH, BUILD_DIR);
  console.log(`   Saved final video to ${OUTPUT_PATH}`);

  console.log(`   Uploading to ${R2_PATH} ...`);
  const { stderr } = await exec('rclone', ['copyto', OUTPUT_PATH, R2_PATH]);
  if (stderr.trim()) console.log(stderr.trim());
  console.log(`   Upload complete: ${R2_PATH}`);
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
