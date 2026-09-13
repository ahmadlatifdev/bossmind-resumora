const { onObjectFinalized } = require('firebase-functions/v2/storage');
const { TranscoderServiceClient } = require('@google-cloud/video-transcoder');

const transcoder = new TranscoderServiceClient();
const PROJECT_ID = process.env.GCLOUD_PROJECT || 'resumora-live';
const LOCATION = 'us-central1';
const BUCKET = 'resumora-videos';
const TEMPLATE_ID = 'interview-hls-template';

exports.autoTranscodeVideo = onObjectFinalized(
  { region: 'us-central1', bucket: BUCKET, memory: '256MiB', timeoutSeconds: 60 },
  async (event) => {
    const filePath = event.data.name;
    const bucket = event.data.bucket;

    if (!filePath.startsWith('input/')) return null;
    if (!/\.(mp4|mov|mkv|webm|avi)$/i.test(filePath)) return null;

    const outputPrefix = filePath.replace('input/', '').replace(/\.[^.]+$/, '');

    const job = {
      inputUri: `gs://${bucket}/${filePath}`,
      outputUri: `gs://${bucket}/output/${outputPrefix}/`,
      templateId: `projects/${PROJECT_ID}/locations/${LOCATION}/jobTemplates/${TEMPLATE_ID}`,
    };

    const [operation] = await transcoder.createJob({
      parent: `projects/${PROJECT_ID}/locations/${LOCATION}`,
      job: job,
    });

    console.log('Job started: ' + operation.name);
    return null;
  }
);
