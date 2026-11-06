import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
// Serve static files (audio + transcripts) directly from pipeline/assets/ so the
// composition can load audio without copying into remotion-editor/public/.
Config.setPublicDir('../assets');
