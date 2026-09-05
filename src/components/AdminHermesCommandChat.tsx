import { FormEvent, useEffect, useState } from 'react';
import { t, tFormat } from '../lib/i18n.js';
import { postAdminHermesCommand } from '../lib/adminApi';

type Msg = { role: 'user' | 'assistant'; text: string; engine?: string };

type Props = {
  lang: string;
  password: string;
  projectId: string;
  projectName: string;
};

function mapCommandError(raw: string, lang: string): string {
  const m = String(raw || '');
  if (
    /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|tunnel|fetch failed|502|503|504|HERMES_API|unreachable|network/i.test(
      m
    )
  ) {
    return t(lang, 'master.harnessTunnelDown');
  }
  return m || t(lang, 'master.harnessCommandFailed');
}

export default function AdminHermesCommandChat({ lang, password, projectId, projectName }: Props) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [byProject, setByProject] = useState<Record<string, Msg[]>>({});

  const messages = byProject[projectId] || [];

  useEffect(() => {
    setError('');
  }, [projectId]);

  function setProjectMessages(next: Msg[] | ((prev: Msg[]) => Msg[])) {
    setByProject((prev) => {
      const cur = prev[projectId] || [];
      const resolved = typeof next === 'function' ? next(cur) : next;
      return { ...prev, [projectId]: resolved };
    });
  }

  function clearChat() {
    setProjectMessages([]);
    setError('');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setError('');
    setInput('');
    setProjectMessages((prev) => [...prev, { role: 'user', text }]);
    try {
      const out = await postAdminHermesCommand(password, {
        projectId,
        message: text,
        lang,
      });
      setProjectMessages((prev) => [
        ...prev,
        { role: 'assistant', text: String(out.reply || ''), engine: out.engine },
      ]);
    } catch (err) {
      setError(mapCommandError(err instanceof Error ? err.message : '', lang));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="admin-harness-chat"
      aria-label={t(lang, 'master.harnessChatAria')}
      aria-busy={busy}
    >
      <div className="admin-harness-chat__head">
        <p className="admin-master__lead">
          {tFormat(lang, 'master.harnessChatLead', { project: projectName })}
        </p>
        <button
          type="button"
          className="admin-master__btn admin-master__btn--ghost"
          onClick={clearChat}
          disabled={busy || messages.length === 0}
          aria-label={t(lang, 'master.harnessClearChat')}
        >
          {t(lang, 'master.harnessClearChat')}
        </button>
      </div>
      <ul className="admin-harness-chat__log">
        {messages.map((m, i) => (
          <li
            key={`${projectId}-${m.role}-${i}`}
            className={`admin-harness-chat__msg admin-harness-chat__msg--${m.role}`}
          >
            <span className="admin-harness-chat__role">
              {m.role === 'user' ? t(lang, 'master.harnessYou') : t(lang, 'master.harnessAgent')}
              {m.engine ? ` · ${m.engine}` : ''}
            </span>
            <pre>{m.text}</pre>
          </li>
        ))}
      </ul>
      {busy ? (
        <p className="admin-harness-chat__typing" role="status" aria-live="polite">
          {t(lang, 'master.harnessTyping')}
        </p>
      ) : null}
      {error ? (
        <p className="admin-master__alert" role="alert">
          {error}
        </p>
      ) : null}
      <form className="admin-harness-chat__form" onSubmit={onSubmit}>
        <label>
          <span className="sr-only">{t(lang, 'master.harnessCommand')}</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t(lang, 'master.harnessPlaceholder')}
            disabled={busy}
            maxLength={4000}
            aria-label={t(lang, 'master.harnessCommand')}
          />
        </label>
        <button type="submit" className="admin-master__btn" disabled={busy || !input.trim()}>
          {busy ? t(lang, 'master.hermesWorking') : t(lang, 'master.harnessSend')}
        </button>
      </form>
    </div>
  );
}
