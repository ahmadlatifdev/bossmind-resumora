import { useEffect, useRef, useState } from 'react';

export type VideoLang = 'en' | 'fr' | 'es';

export type VideoUrls = {
  en?: string;
  fr?: string;
  es?: string;
};

type AdminMultilingualVideoPlayerProps = {
  title: string;
  status?: string;
  urls: VideoUrls;
};

const LANGS: VideoLang[] = ['en', 'fr', 'es'];

/** Strip query/hash so <video src> is exactly the public MP4 path. */
function cleanPlayUrl(raw: string): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  const noHash = s.split('#')[0];
  // Public demos must not carry cache-busters or signed query junk.
  return noHash.split('?')[0];
}

function resolveUrl(urls: VideoUrls, lang: VideoLang): string {
  const en = cleanPlayUrl(urls?.en || '');
  const fr = cleanPlayUrl(urls?.fr || '');
  const es = cleanPlayUrl(urls?.es || '');
  if (lang === 'fr') return fr || en;
  if (lang === 'es') return es || en;
  return en;
}

/** Admin Video Asset Manager player — gold EN / FR / ES source switch. */
export default function AdminMultilingualVideoPlayer({
  title,
  status,
  urls,
}: AdminMultilingualVideoPlayerProps) {
  const [lang, setLang] = useState<VideoLang>('en');
  const [mediaError, setMediaError] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const src = resolveUrl(urls, lang);

  useEffect(() => {
    setMediaError('');
    const el = videoRef.current;
    if (!el || !src) return;
    el.setAttribute('src', src);
    el.src = src;
    el.load();
  }, [src]);

  return (
    <article className="admin-video-player">
      <header className="admin-video-player__header">
        <h3 className="admin-video-player__title">{title || '—'}</h3>
        {status ? <span className="admin-video-player__status">{status}</span> : null}
      </header>
      <div className="admin-video-player__langs" role="group" aria-label="Video language">
        {LANGS.map((code) => (
          <button
            key={code}
            type="button"
            className={
              lang === code
                ? 'admin-video-player__lang admin-video-player__lang--active'
                : 'admin-video-player__lang'
            }
            aria-pressed={lang === code}
            onClick={() => setLang(code)}
          >
            {code.toUpperCase()}
          </button>
        ))}
      </div>
      {src ? (
        <>
          <video
            ref={videoRef}
            className="admin-video-player__video"
            controls
            playsInline
            preload="metadata"
            src={src}
            onError={() =>
              setMediaError('Playback failed — URL blocked or unreachable for this language.')
            }
            onLoadedMetadata={() => setMediaError('')}
          />
          {mediaError ? (
            <p className="admin-master__alert" role="alert">
              {mediaError}
            </p>
          ) : null}
          <p className="admin-video-player__src" title={src}>
            {src}
          </p>
        </>
      ) : (
        <p className="admin-master__lead">No playable URL for this asset.</p>
      )}
    </article>
  );
}
