import { Composition } from 'remotion';
import { InterviewVideo } from './InterviewVideo';

const FPS = 30;
const DEFAULT_DURATION_SECONDS = 120;

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="InterviewVideo"
      component={InterviewVideo}
      durationInFrames={FPS * DEFAULT_DURATION_SECONDS}
      fps={FPS}
      width={1920}
      height={1080}
    />
  );
};
