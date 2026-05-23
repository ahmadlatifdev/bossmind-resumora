#!/usr/bin/env node
/**
 * Live S3 storage validation for bossmind-resumora-storage (default AWS profile).
 * Exit 0 only when both `aws s3 ls` and bucket list succeed.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const bucket = process.env.S3_BUCKET || "bossmind-resumora-uploads-377426330385";
const reportDir = path.join(repoRoot, "windows-heal", "reports");
const proofFile = path.join(reportDir, "aws-cli-validation-proof.json");

function runAws(args) {
  try {
    const out = execFileSync("aws", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, AWS_DEFAULT_REGION: process.env.AWS_REGION || "us-east-1" },
    });
    return { ok: true, output: out.trim() };
  } catch (err) {
    const stderr = err.stderr?.toString?.() || String(err.stderr || "");
    const stdout = err.stdout?.toString?.() || String(err.stdout || "");
    return { ok: false, output: (stderr || stdout).trim(), code: err.status };
  }
}

fs.mkdirSync(reportDir, { recursive: true });

const identity = runAws(["sts", "get-caller-identity", "--output", "json"]);
const listAll = runAws(["s3", "ls"]);
const listBucket = runAws(["s3", "ls", `s3://${bucket}`]);
const ok = listAll.ok && listBucket.ok;

const proof = {
  timestamp: new Date().toISOString(),
  success: ok,
  bucketName: bucket,
  commands: [
    { command: "aws sts get-caller-identity", result: identity },
    { command: "aws s3 ls", result: listAll },
    { command: `aws s3 ls s3://${bucket}`, result: listBucket },
  ],
};

fs.writeFileSync(proofFile, `${JSON.stringify(proof, null, 2)}\n`, "utf8");

if (!ok) {
  console.error("[aws-validate-storage] FAILED");
  if (!listAll.ok) console.error(listAll.output);
  if (!listBucket.ok) console.error(listBucket.output);
  process.exit(1);
}

console.log("[aws-validate-storage] OK");
process.exit(0);
