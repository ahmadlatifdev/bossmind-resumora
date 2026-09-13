import { useMemo, useState } from 'react';
import HlsPlayer from '../components/VideoPlayer/HlsPlayer';

const LANGUAGES = ['EN', 'FR', 'ES'] as const;
type Language = (typeof LANGUAGES)[number];

const DEMO_SOURCE =
  '/videos/manual-template-test/master.m3u8';

export default function VideoDemoPage() {
  const [language, setLanguage] = useState<Language>('EN');
  const source = useMemo(() => DEMO_SOURCE, [language]);

  return (
    <section className="app-main page-content">
      <h1>Pipeline Demo — HLS Adaptive Streaming</h1>
      <p className="lead">
        Preview the adaptive streaming pipeline across the available language tracks.
      </p>

      <div className="flex flex-wrap gap-2 mb-6" role="group" aria-label="Language">
        {LANGUAGES.map((option) => (
          <button
            key={option}
            type="button"
            className={`px-4 py-2 rounded-full border font-semibold transition ${
              language === option
                ? 'bg-[color:var(--color-gold)] text-black border-[color:var(--color-gold)]'
                : 'border-gray-300/50 hover:border-[color:var(--color-gold)]'
            }`}
            aria-pressed={language === option}
            onClick={() => setLanguage(option)}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="max-w-4xl">
        <HlsPlayer key={source} src={source} title="Pipeline Demo — HLS Adaptive Streaming" />
      </div>

      <p className="mt-6 text-sm opacity-75">
        This is a pipeline verification demo. Real interview training videos will appear here.
      </p>
    </section>
  );
}

