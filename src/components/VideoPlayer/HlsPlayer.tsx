import { useEffect, useRef } from 'react';
import Hls from 'hls.js';

type Props = {
  src: string;
  poster?: string;
  title?: string;
};

export default function HlsPlayer({ src, poster, title }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      return undefined;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        enableWorker: true,
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      return () => hls.destroy();
    }

    return undefined;
  }, [src]);

  return (
    <div className="hls-player-wrapper">
      {title ? <h3 className="hls-player-title">{title}</h3> : null}
      <video ref={videoRef} controls playsInline poster={poster} className="hls-player-video" />
    </div>
  );
}
