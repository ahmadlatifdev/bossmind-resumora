#!/usr/bin/env node
/**
 * Orchestrate ComfyUI dynamic-video generation over the local HTTP API.
 *
 * Flow:
 *   1. Load the workflow template (scripts/comfyui_workflow.json).
 *   2. Optionally substitute model placeholders from env / CLI.
 *   3. POST to {COMFY_HOST}/prompt  (queue the job).
 *   4. Poll {COMFY_HOST}/history/{prompt_id} until done, failed, or timeout.
 *   5. Download the rendered .mp4 (and .mp3) into the output dir.
 *
 * Robustness: every HTTP call uses AbortController timeouts; polling has a hard
 * deadline so the script never hangs. ComfyUI being down is handled gracefully.
 *
 * Env overrides:
 *   COMFY_HOST            (default http://127.0.0.1:8188)
 *   COMFY_WORKFLOW        (default ./scripts/comfyui_workflow.json)
 *   COMFY_TIMEOUT_MS      (default 20 minutes)
 *   COMFY_POLL_INTERVAL_MS(default 5000)
 *   COMFY_OUTPUT_DIR      (default ./assets/vid-star-conversational-build-EN)
 *   COMFY_MODEL_CKPT      (overrides the checkpoint placeholder)
 *   COMFY_ANIMATEDIFF_MODEL (overrides the AnimateDiff model placeholder)
 *   COMFY_INPUT_AUDIO     (relative path to the source .mp3)
 *
 * Usage:
 *   node scripts/generate-dynamic-videos.js
 *   node scripts/generate-dynamic-videos.js --audio audio/04-global-career-en.mp3
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const COMFY_HOST = (process.env.COMFY_HOST || 'http://127.0.0.1:8188').replace(/\/$/, '');
const WORKFLOW_PATH =
  process.env.COMFY_WORKFLOW || path.join(ROOT, 'scripts', 'comfyui_workflow.json');
const POLL_INTERVAL_MS = Number(process.env.COMFY_POLL_INTERVAL_MS || 5000);
const TIMEOUT_MS = Number(process.env.COMFY_TIMEOUT_MS || 20 * 60 * 1000);
const OUTPUT_DIR =
  process.env.COMFY_OUTPUT_DIR || path.join(ROOT, 'assets', 'vid-star-conversational-build-EN');

function parseArgs(argv) {
  const args = { audio: process.env.COMFY_INPUT_AUDIO || null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--audio' && argv[i + 1]) args.audio = argv[++i];
    else if (a === '--workflow' && argv[i + 1]) args.workflow = argv[++i];
    else if (a === '--output-dir' && argv[i + 1]) args.outputDir = argv[++i];
  }
  return args;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function requestJson(url, options = {}) {
  const timeoutMs = options.timeoutMs || 30000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text.slice(0, 200) };
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${url}: ${JSON.stringify(data).slice(0, 300)}`);
    }
    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Timed out after ${timeoutMs}ms calling ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function loadWorkflow(workflowPath) {
  if (!fs.existsSync(workflowPath)) {
    throw new Error(`Workflow file not found: ${workflowPath}`);
  }
  return JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
}

/**
 * Substitute placeholder strings in the workflow (e.g. "YOUR_CHECKPOINT.safetensors").
 * Walk every node's inputs and replace exact placeholder values.
 */
function applyOverrides(workflow, overrides) {
  const replace = (value) => {
    if (typeof value === 'string') {
      for (const [placeholder, replacement] of Object.entries(overrides)) {
        if (replacement && value === placeholder) return replacement;
      }
    }
    return value;
  };
  const walk = (node) => {
    if (node && typeof node === 'object' && node.inputs) {
      for (const key of Object.keys(node.inputs)) {
        const v = node.inputs[key];
        if (Array.isArray(v)) {
          node.inputs[key] = v.map(walk);
        } else if (typeof v === 'string') {
          node.inputs[key] = replace(v);
        }
      }
    }
    return node;
  };
  for (const nodeId of Object.keys(workflow)) {
    walk(workflow[nodeId]);
  }
  return workflow;
}

async function queuePrompt(prompt) {
  const body = { prompt, client_id: `resumora-${Date.now()}` };
  const data = await requestJson(`${COMFY_HOST}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeoutMs: 60000,
  });
  if (!data.prompt_id) {
    const err = data.error || data;
    throw new Error(`ComfyUI rejected the prompt: ${JSON.stringify(err).slice(0, 400)}`);
  }
  return data.prompt_id;
}

async function pollUntilDone(promptId) {
  const deadline = Date.now() + TIMEOUT_MS;
  let attempt = 0;
  for (;;) {
    const history = await requestJson(`${COMFY_HOST}/history/${promptId}`, { timeoutMs: 15000 });
    const entry = history && history[promptId];
    if (entry) {
      const status = entry.status || {};
      if (status.completed) return { status: 'completed', entry };
      if (
        status.status_str === 'error' ||
        entry.messages?.some((m) => m[0] === 'execution_error')
      ) {
        const msgs = (entry.messages || [])
          .map((m) => JSON.stringify(m))
          .slice(-3)
          .join('\n');
        throw new Error(`ComfyUI execution failed:\n${msgs}`);
      }
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ComfyUI (prompt ${promptId}) after ${TIMEOUT_MS}ms`);
    }
    attempt += 1;
    if (attempt % 6 === 0) {
      console.log(
        `  … still generating (${Math.round((Date.now() + POLL_INTERVAL_MS - deadline + TIMEOUT_MS) / 1000)}s elapsed, attempt ${attempt})`
      );
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

function collectOutputs(entry) {
  const outputs = [];
  const outs = entry.outputs || {};
  for (const nodeId of Object.keys(outs)) {
    const nodeOuts = outs[nodeId] || {};
    for (const slotName of Object.keys(nodeOuts)) {
      for (const item of nodeOuts[slotName] || []) {
        if (item && item.filename)
          outputs.push({
            nodeId,
            filename: item.filename,
            type: item.type,
            subfolder: item.subfolder || '',
          });
      }
    }
  }
  return outputs;
}

async function downloadOutput(item, destDir) {
  const url = `${COMFY_HOST}/view?filename=${encodeURIComponent(item.filename)}&type=${encodeURIComponent(item.type)}&subfolder=${encodeURIComponent(item.subfolder)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${item.filename}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const dest = path.join(destDir, path.basename(item.filename));
  fs.writeFileSync(dest, buf);
  return dest;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const workflowPath = args.workflow || WORKFLOW_PATH;
  const outputDir = args.outputDir || OUTPUT_DIR;
  ensureDir(outputDir);

  console.log(`ComfyUI: ${COMFY_HOST}`);
  console.log(`Workflow: ${workflowPath}`);
  console.log(`Output dir: ${outputDir}`);

  // Fast health check before queueing.
  try {
    await requestJson(`${COMFY_HOST}/system_stats`, { timeoutMs: 5000 });
  } catch (err) {
    console.error(`✗ ComfyUI is not reachable at ${COMFY_HOST}.`);
    console.error(
      `  Start it first (e.g. python main.py in C:\\Users\\user\\ComfyUI), then re-run.`
    );
    console.error(`  Detail: ${err.message}`);
    process.exit(1);
  }

  const workflow = loadWorkflow(workflowPath);
  const overrides = {
    'YOUR_CHECKPOINT.safetensors': process.env.COMFY_MODEL_CKPT,
    'YOUR_ANIMATEDIFF_MODEL.safetensors': process.env.COMFY_ANIMATEDIFF_MODEL,
    'YOUR_AUDIO.mp3': args.audio,
  };
  const prompt = applyOverrides(workflow, overrides);

  const promptId = await queuePrompt(prompt);
  console.log(`Queued prompt: ${promptId}`);
  const { entry } = await pollUntilDone(promptId);
  console.log('Generation complete.');

  const outputs = collectOutputs(entry);
  if (!outputs.length) {
    console.warn('⚠  No output files found in history entry.');
    console.warn(JSON.stringify(entry.outputs || {}, null, 2).slice(0, 1000));
    return;
  }

  for (const item of outputs) {
    const dest = await downloadOutput(item, outputDir);
    console.log(`✓ downloaded ${item.filename} → ${dest}`);
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
