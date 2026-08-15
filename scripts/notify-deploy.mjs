#!/usr/bin/env node
/**
 * Post-deploy notifier for Slack/Discord webhooks.
 * Set DEPLOY_NOTIFY_WEBHOOK (or DISCORD_WEBHOOK_URL / SLACK_WEBHOOK_URL).
 * Never logs the webhook URL.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i < 1) continue;
    const key = trimmed.slice(0, i).trim();
    let val = trimmed.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnvFile(path.resolve(".env.local"));
loadEnvFile(path.resolve(".env"));

const webhook =
  process.env.DEPLOY_NOTIFY_WEBHOOK ||
  process.env.DISCORD_WEBHOOK_URL ||
  process.env.SLACK_WEBHOOK_URL ||
  "";

const releaseId = process.env.DEPLOY_RELEASE_ID || process.argv[2] || "unknown";
const liveUrl =
  process.env.DEPLOY_LIVE_URL ||
  process.argv[3] ||
  "https://client-resumora-live.web.app";
const project = process.env.DEPLOY_PROJECT || "resumora-live";
const site = process.env.DEPLOY_SITE || "client-resumora-live";

if (!webhook) {
  console.log("notify-deploy: no webhook configured (skipped)");
  process.exit(0);
}

const text =
  `Resumora Hosting deploy succeeded\n` +
  `• Project: ${project}\n` +
  `• Site: ${site}\n` +
  `• Release: ${releaseId}\n` +
  `• Live: ${liveUrl}`;

const isDiscord = /discord(?:app)?\.com\/api\/webhooks/i.test(webhook);
const body = isDiscord
  ? { content: text }
  : { text };

const res = await fetch(webhook, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

if (!res.ok) {
  const detail = await res.text().catch(() => "");
  console.error(`notify-deploy: webhook failed (${res.status})`);
  if (detail) console.error(detail.slice(0, 200));
  process.exit(1);
}

console.log("notify-deploy: sent");
