#!/usr/bin/env node
/**
 * Create BossMind CloudWatch alarms (SNS topic reference only — does not create topics).
 *
 * Usage:
 *   node scripts/create-alarms.js [--region=us-east-1] [--namespace=BossMind/Resumora] [--dry-run]
 *
 * Env:
 *   AWS credentials (standard chain)
 *   BOSSMIND_OBSERVABILITY_SNS_TOPIC_ARN — optional SNS topic for alarm actions (reference only)
 */

const DEFAULT_REGION = "us-east-1";
const DEFAULT_NAMESPACE = "BossMind/Resumora";

const ALARMS = [
  {
    name: "BossMind-HighLatency",
    metricName: "ResumeParsingLatency",
    comparisonOperator: "GreaterThanThreshold",
    threshold: 5000,
    evaluationPeriods: 2,
    datapointsToAlarm: 2,
    statistic: "Average",
    period: 300,
    treatMissingData: "notBreaching",
    description: "Resume parsing latency exceeded 5000 ms (5 min average).",
  },
  {
    name: "BossMind-HighErrorRate",
    metricName: "ResumeParsingSuccess",
    comparisonOperator: "LessThanThreshold",
    threshold: 0.95,
    evaluationPeriods: 2,
    datapointsToAlarm: 2,
    statistic: "Average",
    period: 300,
    treatMissingData: "notBreaching",
    description: "Resume parsing success rate dropped below 95%.",
  },
  {
    name: "BossMind-SentryErrors",
    metricName: "SentryErrorCount",
    comparisonOperator: "GreaterThanThreshold",
    threshold: 10,
    evaluationPeriods: 1,
    datapointsToAlarm: 1,
    statistic: "Sum",
    period: 300,
    treatMissingData: "notBreaching",
    description: "Sentry error count exceeded 10 in a 5-minute window.",
  },
  {
    name: "BossMind-HighTokenUsage",
    metricName: "DeepSeekTokenUsage",
    comparisonOperator: "GreaterThanThreshold",
    threshold: 100000,
    evaluationPeriods: 2,
    datapointsToAlarm: 2,
    statistic: "Sum",
    period: 300,
    treatMissingData: "notBreaching",
    description: "DeepSeek token usage exceeded 100k tokens in a 5-minute window.",
  },
];

function parseArgs() {
  let region = process.env.AWS_REGION || DEFAULT_REGION;
  let namespace = DEFAULT_NAMESPACE;
  let dryRun = false;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--region=")) region = arg.split("=")[1];
    if (arg.startsWith("--namespace=")) namespace = arg.split("=")[1];
    if (arg === "--dry-run") dryRun = true;
  }
  return { region, namespace, dryRun };
}

async function verifyCredentials(region) {
  let stsSdk;
  try {
    stsSdk = require("@aws-sdk/client-sts");
  } catch {
    console.error(
      "[BossMind] WARNING: @aws-sdk/client-sts not installed. Run: npm install @aws-sdk/client-cloudwatch @aws-sdk/client-sts"
    );
    return false;
  }

  const sts = new stsSdk.STSClient({ region });
  try {
    const identity = await sts.send(new stsSdk.GetCallerIdentityCommand({}));
    console.log(`[BossMind] AWS credentials verified (account ${identity.Account}).`);
    return true;
  } catch (err) {
    console.error(
      `[BossMind] WARNING: AWS credentials missing or invalid. Configure credentials before creating alarms.\n` +
        `  Detail: ${err.message || err}`
    );
    return false;
  }
}

function alarmActions(snsTopicArn) {
  return snsTopicArn ? [snsTopicArn] : [];
}

async function createAlarms(region, namespace, snsTopicArn, dryRun) {
  if (dryRun) {
    console.log(`[BossMind] Dry run — would create ${ALARMS.length} alarms in ${region}.`);
    if (snsTopicArn) {
      console.log(`[BossMind] SNS topic reference: ${snsTopicArn}`);
    } else {
      console.log("[BossMind] No SNS topic configured (alarms will have no actions).");
    }
    return ALARMS.map((a) => ({ alarmName: a.name, namespace, dryRun: true }));
  }

  let CloudWatchClient, PutMetricAlarmCommand;
  try {
    ({ CloudWatchClient, PutMetricAlarmCommand } = require("@aws-sdk/client-cloudwatch"));
  } catch {
    console.error(
      "[BossMind] WARNING: @aws-sdk/client-cloudwatch not installed. Run: npm install @aws-sdk/client-cloudwatch"
    );
    process.exitCode = 1;
    return null;
  }

  const client = new CloudWatchClient({ region });
  const actions = alarmActions(snsTopicArn);
  const results = [];

  for (const alarm of ALARMS) {
    try {
      await client.send(
        new PutMetricAlarmCommand({
          AlarmName: alarm.name,
          AlarmDescription: alarm.description,
          Namespace: namespace,
          MetricName: alarm.metricName,
          Statistic: alarm.statistic,
          Period: alarm.period,
          EvaluationPeriods: alarm.evaluationPeriods,
          DatapointsToAlarm: alarm.datapointsToAlarm,
          Threshold: alarm.threshold,
          ComparisonOperator: alarm.comparisonOperator,
          TreatMissingData: alarm.treatMissingData,
          AlarmActions: actions,
          OKActions: actions,
          InsufficientDataActions: actions,
        })
      );
      console.log(`[BossMind] Alarm "${alarm.name}" created/updated.`);
      results.push({ alarmName: alarm.name, status: "ok" });
    } catch (err) {
      console.error(`[BossMind] WARNING: Failed to create alarm "${alarm.name}": ${err.message || err}`);
      results.push({ alarmName: alarm.name, status: "error", error: err.message || String(err) });
      process.exitCode = 1;
    }
  }

  if (snsTopicArn) {
    console.log(`[BossMind] SNS topic reference applied: ${snsTopicArn}`);
  } else {
    console.log(
      "[BossMind] No BOSSMIND_OBSERVABILITY_SNS_TOPIC_ARN set — alarms created without SNS actions."
    );
  }

  return results;
}

async function main() {
  const { region, namespace, dryRun } = parseArgs();
  const snsTopicArn = process.env.BOSSMIND_OBSERVABILITY_SNS_TOPIC_ARN || "";

  console.log(`[BossMind] Region: ${region}`);
  console.log(`[BossMind] Namespace: ${namespace}`);

  const ok = await verifyCredentials(region);
  if (!ok) {
    console.error("[BossMind] Skipping alarm creation — fix credentials and retry.");
    process.exitCode = 1;
    return;
  }

  const results = await createAlarms(region, namespace, snsTopicArn, dryRun);
  if (results) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  }
}

main().catch((err) => {
  console.error(`[BossMind] WARNING: ${err.message || err}`);
  process.exitCode = 1;
});
