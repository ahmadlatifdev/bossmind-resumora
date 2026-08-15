// @ts-nocheck
import React, { useEffect, useRef, useState } from 'react';

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

/**
 * Embedded player with volume/mute/speed + synced EN/FR/ES voiceover narration.
 */
export default function VideoPlayer({
  src,
  title,
  voiceoverText = '',
  lang = 'en',
  autoNarrate = true,
  preload = 'metadata',
}) {
  const videoRef = useRef(null);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.9);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    video.volume = volume;
    video.muted = muted;
    video.playbackRate = speed;
    return undefined;
  }, [volume, muted, speed]);

  useEffect(() => {
    // Chrome loads voices asynchronously.
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
    // Restart narration when language/source changes while playing.
    const video = videoRef.current;
    if (playing && autoNarrate && voiceoverText && video && !video.paused) {
      speak(voiceoverText, lang);
    }
  }, [lang, voiceoverText, autoNarrate, playing]);

  function onPlay() {
    setPlaying(true);
    if (autoNarrate && voiceoverText) speak(voiceoverText, lang);
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
      />
      <div className="video-player__toolbar" role="group" aria-label="Audio controls">
        <button type="button" className="secondary" onClick={toggleMute} aria-pressed={muted}>
          {muted ? 'Unmute' : 'Mute'}
        </button>
        <label className="video-player__volume">
          <span>Volume</span>
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
            aria-label="Volume"
          />
        </label>
        <label className="video-player__speed">
          <span>Speed</span>
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            aria-label="Playback speed"
          >
            <option value={0.75}>0.75×</option>
            <option value={1}>1×</option>
            <option value={1.25}>1.25×</option>
            <option value={1.5}>1.5×</option>
          </select>
        </label>
        <button type="button" className="secondary" onClick={enterFullscreen}>
          Fullscreen
        </button>
      </div>
      {voiceoverText ? (
        <p className="video-player__voice-note muted small">
          Voiceover active ({String(lang).toUpperCase()}) — use volume/mute controls above.
        </p>
      ) : null}
    </div>
  );
}
