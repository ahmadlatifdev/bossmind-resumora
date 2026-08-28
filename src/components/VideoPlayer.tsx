// @ts-nocheck
import React, { useEffect, useRef, useState } from 'react';
import { t } from '../lib/i18n.js';
import { pickCaptionLang } from '../lib/videoLibrary.js';
import { trackVideoStart } from '../lib/analytics.js';

function pickVoice(lang) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  const prefix = String(lang || 'en').toLowerCase();
  return (
    voices.find((v) =>
      String(v.lang || '')
        .toLowerCase()
        .startsWith(prefix)
    ) ||
    voices.find((v) =>
      String(v.lang || '')
        .toLowerCase()
        .startsWith(prefix.slice(0, 2))
    ) ||
    null
  );
}

function speak(text, lang) {
  if (!text || typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang === 'fr' ? 'fr-FR' : lang === 'es' ? 'es-ES' : 'en-US';
  utter.rate = 1;
  const voice = pickVoice(utter.lang);
  if (voice) utter.voice = voice;
  window.speechSynthesis.speak(utter);
}

function stopSpeech() {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

function buildTrackList(captions) {
  if (!captions || typeof captions !== 'object') return { tracks: [], blobUrls: [] };
  const codes = ['en', 'fr', 'es'].filter((c) => captions[c]);
  const ordered = codes.includes('en') ? ['en', ...codes.filter((c) => c !== 'en')] : codes;
  const blobUrls = [];
  const tracks = ordered
    .map((code) => {
      const entry = captions[code];
      let srcUrl = '';
      if (entry.kind === 'url' && entry.src) {
        srcUrl = entry.src;
      } else if (entry.kind === 'vtt-text' && entry.text) {
        const blob = new Blob([entry.text], { type: 'text/vtt' });
        srcUrl = URL.createObjectURL(blob);
        blobUrls.push(srcUrl);
      }
      return {
        code,
        src: srcUrl,
        label: entry.label || code.toUpperCase(),
        srclang: entry.srclang || code,
      };
    })
    .filter((tr) => tr.src);
  return { tracks, blobUrls };
}

/**
 * Custom HTML5 player with i18n chrome (EN/FR/ES) + caption tracks.
 * Native browser controls stay for scrubbing; toolbar labels use t(uiLang).
 */
export default function VideoPlayer({
  src,
  title,
  videoId = '',
  voiceoverText = '',
  lang = 'en',
  uiLang = 'en',
  captions = null,
  autoNarrate = true,
  preload = 'metadata',
}) {
  const videoRef = useRef(null);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.9);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [captionLang, setCaptionLang] = useState(() => pickCaptionLang(captions, lang) || 'en');
  const [trackList, setTrackList] = useState([]);

  useEffect(() => {
    const { tracks, blobUrls } = buildTrackList(captions);
    setTrackList(tracks);
    return () => {
      blobUrls.forEach((u) => {
        try {
          URL.revokeObjectURL(u);
        } catch (_) {
          /* ignore */
        }
      });
    };
  }, [captions]);

  const hasCaptions = trackList.length > 0;

  useEffect(() => {
    const next = pickCaptionLang(captions, lang);
    if (next) setCaptionLang(next);
  }, [lang, captions]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    video.volume = volume;
    video.muted = muted;
    video.playbackRate = speed;
    return undefined;
  }, [volume, muted, speed]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      const onVoices = () => window.speechSynthesis.getVoices();
      window.speechSynthesis.addEventListener('voiceschanged', onVoices);
      return () => window.speechSynthesis.removeEventListener('voiceschanged', onVoices);
    }
    return undefined;
  }, []);

  useEffect(() => () => stopSpeech(), []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const tracks = video.textTracks;
    if (!tracks) return;
    for (let i = 0; i < tracks.length; i += 1) {
      const tr = tracks[i];
      const code = String(tr.language || '').toLowerCase();
      const show = captionsOn && hasCaptions && code === captionLang;
      tr.mode = show ? 'showing' : 'disabled';
    }
  }, [captionsOn, captionLang, hasCaptions, trackList, src, lang]);

  useEffect(() => {
    const video = videoRef.current;
    if (playing && autoNarrate && voiceoverText && video && !video.paused) {
      speak(voiceoverText, lang);
    }
  }, [lang, voiceoverText, autoNarrate, playing]);

  function onPlay() {
    setPlaying(true);
    if (autoNarrate && voiceoverText) speak(voiceoverText, lang);
    trackVideoStart(videoId || title || 'video', lang);
  }

  function onPause() {
    setPlaying(false);
    stopSpeech();
  }

  function onEnded() {
    setPlaying(false);
    stopSpeech();
  }

  function toggleMute() {
    setMuted((m) => !m);
  }

  function enterFullscreen() {
    const el = videoRef.current;
    if (!el) return;
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  }

  const chrome = uiLang || lang || 'en';
  const defaultCaption = pickCaptionLang(captions, lang) || 'en';

  return (
    <div className="video-player">
      <video
        ref={videoRef}
        key={`${src}-${lang}`}
        className="video-player__media"
        controls
        playsInline
        preload={preload}
        src={src}
        muted={muted}
        aria-label={title}
        onPlay={onPlay}
        onPause={onPause}
        onEnded={onEnded}
      >
        {trackList.map((tr) => (
          <track
            key={`${tr.code}-${tr.src}`}
            kind="captions"
            srcLang={tr.srclang}
            label={tr.label}
            src={tr.src}
            default={tr.code === defaultCaption}
          />
        ))}
      </video>
      <div
        className="video-player__toolbar"
        role="group"
        aria-label={t(chrome, 'player.audioControls')}
      >
        <button
          type="button"
          className="secondary"
          onClick={toggleMute}
          aria-pressed={muted}
          aria-label={muted ? t(chrome, 'player.unmute') : t(chrome, 'player.mute')}
        >
          {muted ? t(chrome, 'player.unmute') : t(chrome, 'player.mute')}
        </button>
        <label className="video-player__volume">
          <span>{t(chrome, 'player.volume')}</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={muted ? 0 : volume}
            onChange={(e) => {
              const next = Number(e.target.value);
              setVolume(next);
              if (next > 0) setMuted(false);
            }}
            aria-label={t(chrome, 'player.volume')}
          />
        </label>
        <label className="video-player__speed">
          <span>{t(chrome, 'player.speed')}</span>
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            aria-label={t(chrome, 'player.speed')}
          >
            <option value={0.75}>0.75×</option>
            <option value={1}>1×</option>
            <option value={1.25}>1.25×</option>
            <option value={1.5}>1.5×</option>
          </select>
        </label>
        {hasCaptions ? (
          <>
            <button
              type="button"
              className="secondary"
              onClick={() => setCaptionsOn((v) => !v)}
              aria-pressed={captionsOn}
              aria-label={t(chrome, 'player.captions')}
            >
              {t(chrome, 'player.captions')}:{' '}
              {captionsOn ? t(chrome, 'player.captionsOn') : t(chrome, 'player.captionsOff')}
            </button>
            <label className="video-player__captions">
              <span>{t(chrome, 'player.captionLang')}</span>
              <select
                value={captionLang}
                onChange={(e) => {
                  setCaptionLang(e.target.value);
                  setCaptionsOn(true);
                }}
                aria-label={t(chrome, 'player.captionLang')}
                disabled={!captionsOn}
              >
                {trackList.map((tr) => (
                  <option key={tr.code} value={tr.code}>
                    {tr.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <span className="muted small">{t(chrome, 'player.noCaptions')}</span>
        )}
        <button
          type="button"
          className="secondary"
          onClick={enterFullscreen}
          aria-label={t(chrome, 'player.fullscreen')}
        >
          {t(chrome, 'player.fullscreen')}
        </button>
      </div>
      {voiceoverText ? (
        <p className="video-player__voice-note muted small">
          {t(chrome, 'player.voiceoverActive').replace('{lang}', String(lang).toUpperCase())}
        </p>
      ) : null}
    </div>
  );
}
