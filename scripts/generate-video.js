import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import dotenv from 'dotenv';
import Replicate from 'replicate';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env.replicate') });

const DEFAULT_MODEL = 'zsxkib/memo';
const MODEL_VERSION = 'be54f93bc72d562ab2577f57b7eec44707efde55d058ee504c8b65a62d70fdf3';
const DEFAULT_OUTPUT = 'output_en.mp4';

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.mp4': 'audio/mp4',
  '.webm': 'audio/webm',
};

function printHelp() {
  console.log(`
Usage: node scripts/generate-video.js --image <path> --audio <path> [options]

Options:
  -i, --image <path>    Source portrait image (required)
  -a, --audio <path>    Driving audio clip (required)
  -o, --output <path>   Output video path (default: output_en.mp4)
  -m, --model <id>      Replicate model (default: zsxkib/memo)
      --resolution <n>  Optional output resolution (passed through to model)
      --fps <n>         Optional frames-per-second (passed through to model)
  -h, --help            Show this help
`);
}

async function toDataUri(filePath) {
  const data = await readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
  return `data:${mime};base64,${data.toString('base64')}`;
}

function parseArgs(argv) {
  const opts = { output: DEFAULT_OUTPUT, model: DEFAULT_MODEL };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--image' || arg === '-i') opts.image = next();
    else if (arg === '--audio' || arg === '-a') opts.audio = next();
    else if (arg === '--output' || arg === '-o') opts.output = next();
    else if (arg === '--model' || arg === '-m') opts.model = next();
    else if (arg === '--resolution') opts.resolution = next();
    else if (arg === '--fps') opts.fps = next();
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else positional.push(arg);
  }
  if (!opts.image && positional[0]) opts.image = positional[0];
  if (!opts.audio && positional[1]) opts.audio = positional[1];
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help || !opts.image || !opts.audio) {
    if (!opts.help) {
      console.error('Error: --image and --audio are required.\n');
    }
    printHelp();
    process.exit(opts.help ? 0 : 1);
  }

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token || token === 'PASTE_YOUR_KEY_HERE') {
    console.error('Error: REPLICATE_API_TOKEN is not set. Open .env.replicate and paste your key.');
    process.exit(1);
  }

  const replicate = new Replicate({ auth: token });

  const input = {
    image: await toDataUri(opts.image),
    audio: await toDataUri(opts.audio),
  };
  if (opts.resolution !== undefined) input.resolution = Number(opts.resolution);
  if (opts.fps !== undefined) input.fps = Number(opts.fps);

  const modelRef = opts.model === DEFAULT_MODEL ? `${DEFAULT_MODEL}:${MODEL_VERSION}` : opts.model;
  console.log(`Running model ${modelRef} ... (this can take a few minutes)`);
  const output = await replicate.run(modelRef, { input });

  const url = Array.isArray(output) ? output[0] : output;
  if (!url) {
    console.error('Error: model returned no output.');
    process.exit(1);
  }
  console.log(`Generated: ${url}`);

  const res = await fetch(url);
  if (!res.ok) {
    console.error(`Error: download failed (${res.status} ${res.statusText}).`);
    process.exit(1);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(opts.output, buffer);
  console.log(`Saved video to ${opts.output}`);
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
