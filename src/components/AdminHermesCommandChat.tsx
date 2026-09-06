import { FormEvent, useEffect, useRef, useState } from 'react';
import { t, tFormat } from '../lib/i18n.js';
import { postAdminHermesCommand } from '../lib/adminApi';
import AdminMarkdown from './AdminMarkdown';

type Msg = {
  role: 'user' | 'assistant';
  text: string;
  engine?: string;
  hasCodePatch?: boolean;
};

type Props = {
  lang: string;
  password: string;
  /** Omit or use with mode="global" for Global Admin Chat (no project dropdown). */
  projectId?: string;
  projectName?: string;
  mode?: 'project' | 'global';
};

const GLOBAL_THREAD = '__global__';

function mapCommandError(raw: string, lang: string): string {
  const m = String(raw || '');
  if (
    /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|tunnel|fetch failed|502|503|504|HERMES_API|unreachable|network|local queue/i.test(
      m
    )
  ) {
    return t(lang, 'master.harnessTunnelDown');
  }
  return m || t(lang, 'master.harnessCommandFailed');
}

export default function AdminHermesCommandChat({
  lang,
  password,
  projectId = '',
  projectName = '',
  mode = 'project',
}: Props) {
  const isGlobal = mode === 'global';
  const threadKey = isGlobal ? GLOBAL_THREAD : projectId || 'resumora';
  const [input, setInput] = useState('');
  const [codePatch, setCodePatch] = useState('');
  const [showPatch, setShowPatch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [byProject, setByProject] = useState<Record<string, Msg[]>>({});
  const logRef = useRef<HTMLDivElement | null>(null);

  const messages = byProject[threadKey] || [];

  useEffect(() => {
    setError('');
    setNotice('');
  }, [threadKey]);

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, busy, threadKey]);

  function setThreadMessages(next: Msg[] | ((prev: Msg[]) => Msg[])) {
    setByProject((prev) => {
      const cur = prev[threadKey] || [];
      const resolved = typeof next === 'function' ? next(cur) : next;
      return { ...prev, [threadKey]: resolved };
    });
  }

  function clearChat() {
    setThreadMessages([]);
    setError('');
    setNotice('');
    setCodePatch('');
    setShowPatch(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    const patch = codePatch.trim();
    if ((!text && !patch) || busy) return;

    const displayText = patch
      ? `${text || 'Code patch attached for review.'}\n\n\`\`\`diff\n${patch}\n\`\`\``
      : text;

    setBusy(true);
    setError('');
    setNotice('');
    setInput('');
    setThreadMessages((prev) => [
      ...prev,
      { role: 'user', text: displayText, hasCodePatch: Boolean(patch) },
    ]);

    try {
      const out = await postAdminHermesCommand(password, {
        ...(isGlobal
          ? { scope: 'global' as const }
          : { projectId: projectId || 'resumora', scope: 'project' as const }),
        message: text || 'Please review the attached code patch for this project.',
        lang,
        codeDiff: patch || undefined,
        codePatch: patch || undefined,
      });
      setThreadMessages((prev) => [
        ...prev,
        { role: 'assistant', text: String(out.reply || ''), engine: out.engine },
      ]);
      if (patch) {
        setCodePatch('');
        setShowPatch(false);
        setNotice(t(lang, 'master.harnessPatchStored'));
      }
    } catch (err) {
      setError(mapCommandError(err instanceof Error ? err.message : '', lang));
    } finally {
      setBusy(false);
    }
  }

  const canSend = Boolean(input.trim() || codePatch.trim()) && !busy;
  const lead = isGlobal
    ? t(lang, 'master.globalChatLead')
    : tFormat(lang, 'master.harnessChatLead', { project: projectName });
  const contextLine = isGlobal
    ? t(lang, 'master.globalChatContext')
    : tFormat(lang, 'master.harnessChatContext', { project: projectName });

  return (
    <div
      className="admin-harness-chat"
      aria-label={isGlobal ? t(lang, 'master.globalChatAria') : t(lang, 'master.harnessChatAria')}
      aria-busy={busy}
    >
      <div className="admin-harness-chat__head">
        <div>
          <p className="admin-master__lead admin-harness-chat__lead">{lead}</p>
          <p className="admin-harness-chat__context">{contextLine}</p>
        </div>
        <button
          type="button"
          className="admin-master__btn admin-master__btn--ghost"
          onClick={clearChat}
          disabled={busy || (messages.length === 0 && !codePatch)}
          aria-label={t(lang, 'master.harnessClearChat')}
        >
          {t(lang, 'master.harnessClearChat')}
        </button>
      </div>

      <div
        ref={logRef}
        className="admin-harness-chat__log"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {!messages.length && !busy ? (
          <div className="admin-harness-chat__empty">
            <p>{t(lang, isGlobal ? 'master.globalChatEmpty' : 'master.harnessChatEmpty')}</p>
            <p className="admin-master__lead">
              {t(lang, isGlobal ? 'master.globalChatEmptyHint' : 'master.harnessChatEmptyHint')}
            </p>
          </div>
        ) : null}

        {messages.map((m, i) => (
          <article
            key={`${threadKey}-${m.role}-${i}`}
            className={`admin-harness-chat__bubble admin-harness-chat__bubble--${m.role}`}
          >
            <header className="admin-harness-chat__role">
              {m.role === 'user' ? t(lang, 'master.harnessYou') : t(lang, 'master.harnessAgent')}
              {m.engine ? ` · ${m.engine}` : ''}
              {m.hasCodePatch ? ` · ${t(lang, 'master.harnessPatchBadge')}` : ''}
            </header>
            {m.role === 'assistant' ? (
              <AdminMarkdown
                text={m.text}
                onCopyCode={() => setNotice(t(lang, 'master.harnessCodeCopied'))}
              />
            ) : (
              <AdminMarkdown text={m.text} />
            )}
          </article>
        ))}

        {busy ? (
          <div className="admin-harness-chat__thinking" role="status" aria-live="polite">
            <span className="admin-harness-chat__dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>{t(lang, 'master.harnessTyping')}</span>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="admin-master__alert" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="admin-master__ok" role="status">
          {notice}
        </p>
      ) : null}

      {showPatch ? (
        <div className="admin-harness-chat__patch" aria-label={t(lang, 'master.harnessAttachCode')}>
          <div className="admin-harness-chat__patch-bar">
            <strong>{t(lang, 'master.harnessAttachCode')}</strong>
            <button
              type="button"
              className="admin-master__btn admin-master__btn--ghost"
              onClick={() => {
                setShowPatch(false);
                setCodePatch('');
              }}
            >
              {t(lang, 'master.harnessRemovePatch')}
            </button>
          </div>
          <label className="admin-harness-chat__patch-label">
            <span className="sr-only">{t(lang, 'master.harnessAttachCode')}</span>
            <textarea
              className="admin-harness-chat__code"
              value={codePatch}
              onChange={(e) => setCodePatch(e.target.value)}
              placeholder={t(lang, 'master.harnessPatchPlaceholder')}
              disabled={busy}
              spellCheck={false}
              rows={8}
              maxLength={40000}
            />
          </label>
        </div>
      ) : null}

      <form className="admin-harness-chat__form" onSubmit={onSubmit}>
        <label className="admin-harness-chat__composer">
          <span className="sr-only">{t(lang, 'master.harnessCommand')}</span>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t(
              lang,
              isGlobal ? 'master.globalChatPlaceholder' : 'master.harnessPlaceholder'
            )}
            disabled={busy}
            maxLength={8000}
            rows={3}
            aria-label={t(lang, 'master.harnessCommand')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (canSend) {
                  (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
                }
              }
            }}
          />
        </label>
        <div className="admin-harness-chat__actions">
          <button
            type="button"
            className="admin-master__btn admin-master__btn--ghost"
            disabled={busy}
            onClick={() => setShowPatch((v) => !v)}
          >
            {showPatch ? t(lang, 'master.harnessHidePatch') : t(lang, 'master.harnessAttachCode')}
          </button>
          <button type="submit" className="admin-master__btn" disabled={!canSend}>
            {busy ? t(lang, 'master.hermesWorking') : t(lang, 'master.harnessSend')}
          </button>
        </div>
      </form>
    </div>
  );
}
