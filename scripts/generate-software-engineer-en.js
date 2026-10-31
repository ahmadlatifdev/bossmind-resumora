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
const AUDIO_PATH = path.join(ROOT, 'assets', 'software-engineer-full-audio-EN.mp3');
const BUILD_DIR = path.join(ROOT, 'assets', 'software-engineer-full-build-EN');
const OUTPUT_PATH = path.join(ROOT, 'resumora_cinematic_Software_Engineer_EN.mp4');
const R2_PATH = 'r2:resumora-videos/resumora_cinematic_Software_Engineer_EN.mp4';

const SEGMENT_SECONDS = 30;

const WAN_PROMPT =
  'A professional woman speaking directly to the camera, natural head movements and clear lip sync, seated in a modern glass-walled office, cinematic lighting';

const FULL_TEXT =
  'Welcome to Software Engineer Interview Mastery. This is the complete Resumora guide to landing your next software engineering role. Software engineering interviews are different from most other interviews. They test not just what you know, but how you think, how you solve problems, and how you communicate under pressure. In this masterclass, we will break down every stage, from the coding round to system design to the behavioral conversation, and give you a clear, repeatable system to succeed. Let us start with the coding interview, because this is where most candidates feel the most pressure. The typical coding round gives you a problem, often involving data structures or algorithms, and asks you to write a working solution while explaining your thinking out loud. The single most important skill here is communication. Do not sit in silence and type. Walk the interviewer through your thought process. Start by restating the problem in your own words, and ask clarifying questions. What are the inputs? What are the constraints? Can the array contain negative numbers? Is the input sorted? These questions show that you think before you code, and they often reveal the key to the problem. Once you understand the problem, discuss your approach before writing any code. Start with a simple brute force solution, explain why it works, and then talk about how to optimize it. Always discuss the time and space complexity of every solution, using big O notation. Interviewers love to hear phrases like, this runs in O of n log n time and uses O of one space. If you can walk through the tradeoffs between two approaches, you are already ahead of most candidates. Only after you have agreed on an approach should you start writing code. Write clean, readable code with meaningful variable names. And as you code, keep narrating what each line does. When you finish writing, do not just say done. Test your solution. Walk through a small example, step by step, and trace the values. Then test the edge cases: an empty array, a single element, duplicate values, very large inputs. Interviewers consistently rank testing and edge case handling as one of the biggest differentiators between a hire and a no hire. If you find a bug, stay calm, debug it out loud, and fix it. How you handle a bug often matters more than whether you write perfect code the first time. To prepare for coding rounds, you need a system. Practice on a platform like LeetCode, and focus on the core patterns rather than memorizing individual problems. Master the fundamentals: arrays and strings, hash maps, two pointers, sliding window, trees and graphs, depth first and breadth first search, recursion, dynamic programming, and sorting. Most interview questions are variations of a small number of patterns. When you can recognize the pattern, the solution follows naturally. Aim for quality over quantity. Solving fifty problems deeply, understanding why each solution works, is far more valuable than rushing through three hundred. Next is the system design interview. This is common for mid level and senior roles. You will be asked something like, design a URL shortener, or design a social media feed. The goal is not to produce a perfect answer, but to show that you can think through a large, ambiguous problem. Start by clarifying the requirements. How many users? What is the expected traffic? What are the latency requirements? Then sketch the high level architecture: clients, load balancers, application servers, databases, and caches. Discuss tradeoffs. When would you choose a relational database versus a key value store? When do you need a message queue? Interviewers want to see that you understand the big picture and can justify your choices. Finish by discussing bottlenecks and how you would scale the system over time. Then there is the technical knowledge round, which tests your computer science fundamentals. Expect questions on operating systems, networks, databases, and programming languages. Review concepts like threads and processes, concurrency and locking, TCP versus UDP, database indexing and transactions, and object oriented design principles. You do not need to be an expert in everything, but you should be able to speak fluently about the technologies on your resume. Never put a technology on your resume that you cannot discuss in depth. Finally, do not underestimate the behavioral round. Software engineering is a team sport, and companies want to know how you collaborate, handle conflict, and learn from failure. Use the STAR method to structure your answers, and prepare stories about a time you solved a difficult bug, a time you disagreed with a teammate, and a time you had to learn a new technology quickly. Keep your stories concrete, and quantify the impact where you can. Let me leave you with a few final tips. First, do mock interviews with a friend or a timer. Practice talking while you code, because that is the hardest part to do under pressure. Second, prepare a short, confident introduction about yourself and your experience. Third, at the end of the interview, ask thoughtful questions about the team, the tech stack, and the challenges they are solving. It shows genuine interest. Fourth, after each interview, write down what you were asked and reflect on what you could improve. Here is your quick recap. Coding interviews test your problem solving and communication. Always explain your thinking, discuss complexity, and test your edge cases. System design tests your ability to handle ambiguity and tradeoffs. Technical rounds test your fundamentals. And behavioral rounds test how you work with people. Prepare with a system, practice talking while coding, and stay calm and curious. This is the Resumora Software Engineer Interview Mastery framework. Master it, and you will walk into your next interview ready to solve, design, and communicate with confidence. Good luck, and go land that engineering role.';

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
    console.log('[1/4] Generating ~7min EN audio with minimax/speech-02-hd ...');
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
