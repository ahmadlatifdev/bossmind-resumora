import { Composition } from 'remotion';
import { InterviewVideo, InterviewVideoProps } from './InterviewVideo';

const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;

export const RemotionRoot = () => {
  return (
    <Composition
      id="InterviewVideo"
      component={InterviewVideo}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={{ transcript: [], audioFile: 'audio/placeholder.mp3' }}
      calculateMetadata={({ props }) => {
        const lastEnd = props.transcript.length
          ? props.transcript[props.transcript.length - 1].end
          : 120;
        return {
          durationInFrames: Math.ceil((lastEnd + 1) * FPS),
        };
      }}
    />
  );
};

export type { InterviewVideoProps };
