import { spring, useCurrentFrame, useVideoConfig } from 'remotion';

/**
 * Kinetic "Word-Pop" typography — each word scales in with a spring overshoot,
 * styled in the Resumora gold with a drop shadow for readability.
 */
export const WordPop: React.FC<{ word: string }> = ({ word }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame, fps, config: { damping: 9, stiffness: 220, mass: 0.7 } });

  return (
    <span
      style={{
        display: 'inline-block',
        color: '#D4AF37',
        fontWeight: 800,
        fontSize: 72,
        letterSpacing: 1,
        transform: `scale(${scale})`,
        textShadow: '0 3px 10px rgba(0, 0, 0, 0.85)',
      }}
    >
      {word}
    </span>
  );
};
