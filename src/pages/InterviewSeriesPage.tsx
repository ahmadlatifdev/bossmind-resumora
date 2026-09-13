import { useState } from 'react';
import '../app-shell.css';

const LANGUAGES = [
  { code: 'en', label: 'EN' },
  { code: 'fr', label: 'FR' },
  { code: 'es', label: 'ES' },
];

const SERIES = [
  {
    id: '01-resume-to-interview',
    title: 'Resume-to-Interview Mastery (ATS Optimization)',
    description:
      'Align keywords with the job description, turn ATS gains into interview talking points, and use project-first formats.',
  },
  {
    id: '02-star-behavioral',
    title: 'Behavioral & STAR Method Excellence',
    description:
      "Deep-dive into STAR, build 4-5 versatile story blocks, and answer 'greatest weakness' with transparent growth framing.",
  },
  {
    id: '03-situational-async',
    title: 'Situational & Asynchronous Interview Strategy',
    description:
      'Handle situational prompts with critical thinking and EQ, use 2+6 minute timing, and open with a brief, commanding intro.',
  },
  {
    id: '04-global-career',
    title: 'Multi-Language & Global Career Positioning',
    description:
      'Navigate India/US/UK/Canada/Australia interview norms, body language for global audiences, and market-tuned AI job search.',
  },
];

export default function InterviewSeriesPage() {
  const [lang, setLang] = useState('en');

  return (
    <div className="app-shell">
      <header className="app-header site-header site-header--logo-lang-only">
        <a href="/" className="site-logo" aria-label="RESUMORA.NET">
          <img
            className="site-logo__mark"
            src="/resumora-logo.png"
            alt=""
            width={56}
            height={56}
            decoding="async"
          />
        </a>
      </header>

      <main className="app-main" style={{ maxWidth: 960 }}>
        <h1>Interview Training Series</h1>
        <p className="lead">
          Four professional audio training modules. Free to listen in English, French, and Spanish.
        </p>

        <div className="row-actions" style={{ gap: 8, marginBottom: 20 }}>
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              className={lang === l.code ? 'primary' : 'secondary'}
              onClick={() => setLang(l.code)}
            >
              {l.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gap: 20 }}>
          {SERIES.map((s) => (
            <section key={s.id} className="panel">
              <h2 style={{ marginTop: 0 }}>{s.title}</h2>
              <p className="text-sm opacity-80" style={{ marginBottom: 12 }}>
                {s.description}
              </p>
              <audio
                controls
                preload="none"
                style={{ width: '100%' }}
                src={`/audio/${s.id}-${lang}.mp3`}
              />
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
