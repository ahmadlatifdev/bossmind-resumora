import { AbsoluteFill, Sequence, Video } from 'remotion';
import { WordPop } from './WordPop';

export type TranscriptWord = {
  word: string;
  start: number; // seconds
  end: number; // seconds
};

export type InterviewVideoProps = {
  src: string;
  transcript: TranscriptWord[];
  fps: number;
};

/**
 * Composition: full-screen raw interview video + word-pop subtitles, synced to
 * word-level timestamps (seconds). Each word pops in at the bottom center during
 * its time window.
 */
export const InterviewVideo: React.FC<InterviewVideoProps> = ({ src, transcript, fps }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#0a1a3a' }}>
      <Video src={src} style={{ position: 'absolute', width: '100%', height: '100%' }} />
      {transcript.map((word, i) => {
        const from = Math.max(0, Math.round(word.start * fps));
        const duration = Math.max(1, Math.round((word.end - word.start) * fps));
        return (
          <Sequence key={`${word.word}-${i}`} from={from} durationInFrames={duration}>
            <AbsoluteFill
              style={{
                justifyContent: 'flex-end',
                alignItems: 'center',
                paddingBottom: 140,
              }}
            >
              <WordPop word={word.word} />
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
