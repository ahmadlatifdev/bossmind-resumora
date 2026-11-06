import { spring, useCurrentFrame, useVideoConfig } from 'remotion';

/**
 * Kinetic "Word-Pop" typography — each word pops from 50% to full scale, styled
 * in the Resumora gold with a drop shadow for readability. The short
 * durationInFrames ensures the word is fully visible (not stuck at scale 0).
 */
export const WordPop = ({ word }: { word: string }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame,
    fps,
    from: 0.5,
    to: 1,
    config: { damping: 200 },
    durationInFrames: Math.max(2, Math.round(fps * 0.12)),
  });

  return (
    <span
      style={{
        display: 'inline-block',
        color: '#D4AF37',
        fontWeight: 800,
        fontSize: 64,
        letterSpacing: 1,
        transform: `scale(${scale})`,
        textShadow: '0 3px 10px rgba(0, 0, 0, 0.85)',
      }}
    >
      {word}
    </span>
  );
};
