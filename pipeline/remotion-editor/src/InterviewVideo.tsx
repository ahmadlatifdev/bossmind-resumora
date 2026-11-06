import { AbsoluteFill, Audio, Sequence, staticFile, useVideoConfig } from 'remotion';
import { WordPop } from './WordPop';

export type TranscriptWord = {
  word: string;
  start: number; // seconds
  end: number; // seconds
};

export type InterviewVideoProps = {
  transcript: TranscriptWord[];
  /** Audio file path relative to pipeline/assets/ (the configured public dir). */
  audioFile: string;
};

/**
 * Final interview video: stylish navy background + conversation audio + gold
 * word-pop subtitles synced to word-level timestamps.
 */
export const InterviewVideo = ({ transcript, audioFile }: InterviewVideoProps) => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a1a3a' }}>
      <Audio src={staticFile(audioFile)} />

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
