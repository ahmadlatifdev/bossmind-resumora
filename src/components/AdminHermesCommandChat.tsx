import { FormEvent, useState } from 'react';
import { t, tFormat } from '../lib/i18n.js';
import { postAdminHermesCommand } from '../lib/adminApi';

type Msg = { role: 'user' | 'assistant'; text: string; engine?: string };

type Props = {
  lang: string;
  password: string;
  projectId: string;
  projectName: string;
};

export default function AdminHermesCommandChat({ lang, password, projectId, projectName }: Props) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setError('');
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text }]);
    try {
      const out = await postAdminHermesCommand(password, {
        projectId,
        message: text,
        lang,
      });
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: String(out.reply || ''), engine: out.engine },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'master.harnessCommandFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-harness-chat" aria-label={t(lang, 'master.harnessChatAria')}>
      <p className="admin-master__lead">
        {tFormat(lang, 'master.harnessChatLead', { project: projectName })}
      </p>
      <ul className="admin-harness-chat__log">
        {messages.map((m, i) => (
          <li
            key={`${m.role}-${i}`}
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
          />
        </label>
        <button type="submit" className="admin-master__btn" disabled={busy || !input.trim()}>
          {busy ? t(lang, 'master.hermesWorking') : t(lang, 'master.harnessSend')}
        </button>
      </form>
    </div>
  );
}
