import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAuth } from '../components/AdminAuthGate';
import {
  fetchBossMindManual,
  saveBossMindManual,
  type BossMindManualDoc,
} from '../lib/sharedMemoryClient';
import { t } from '../lib/i18n.js';

const AUTOSAVE_MS = 1200;

export default function AdminManualPage() {
  const { lang, password } = useAdminAuth();
  const [title, setTitle] = useState('BossMind Manual');
  const [content, setContent] = useState('');
  const [meta, setMeta] = useState<BossMindManualDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSave = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const out = await fetchBossMindManual(password);
      const manual = out.manual || {};
      skipNextSave.current = true;
      setTitle(String(manual.title || 'BossMind Manual'));
      setContent(String(manual.content || ''));
      setMeta(manual);
      setDirty(false);
      setSavedAt(manual.updatedAt ? String(manual.updatedAt) : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'bossmindManual.loadFail'));
    } finally {
      setLoading(false);
    }
  }, [password, lang]);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = useCallback(
    async (nextTitle: string, nextContent: string) => {
      setSaving(true);
      setError('');
      try {
        const out = await saveBossMindManual(password, {
          title: nextTitle,
          content: nextContent,
        });
        setMeta(out.manual || null);
        setSavedAt(out.manual?.updatedAt ? String(out.manual.updatedAt) : new Date().toISOString());
        setDirty(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : t(lang, 'bossmindManual.saveFail'));
      } finally {
        setSaving(false);
      }
    },
    [password, lang]
  );

  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    if (!dirty || loading) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void persist(title, content);
    }, AUTOSAVE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [title, content, dirty, loading, persist]);

  return (
    <div className="admin-dashboard">
      <p>
        <Link to="/admin/master">{t(lang, 'master.backOverview')}</Link>
        {' · '}
        <button
          type="button"
          className="admin-master__btn"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? t(lang, 'heal.refresh') + '…' : t(lang, 'heal.refresh')}
        </button>
        {' · '}
        <button
          type="button"
          className="admin-master__btn"
          disabled={saving || loading || !dirty}
          onClick={() => void persist(title, content)}
        >
          {saving ? t(lang, 'bossmindManual.saving') : t(lang, 'bossmindManual.saveNow')}
        </button>
      </p>

      <section className="admin-master__card">
        <h2>{t(lang, 'bossmindManual.title')}</h2>
        <p className="admin-master__lead">{t(lang, 'bossmindManual.lead')}</p>
        {error ? (
          <p className="admin-master__alert" role="alert">
            {error}
          </p>
        ) : null}
        <p className="admin-master__lead" role="status">
          {saving
            ? t(lang, 'bossmindManual.saving')
            : dirty
              ? t(lang, 'bossmindManual.unsaved')
              : savedAt
                ? `${t(lang, 'bossmindManual.savedAt')}: ${savedAt}`
                : t(lang, 'bossmindManual.ready')}
          {meta?.version != null ? ` · v${meta.version}` : ''}
        </p>

        <label className="admin-manual__label" htmlFor="bossmind-manual-title">
          {t(lang, 'bossmindManual.fieldTitle')}
        </label>
        <input
          id="bossmind-manual-title"
          className="admin-manual__title-input"
          value={title}
          disabled={loading}
          onChange={(e) => {
            setTitle(e.target.value);
            setDirty(true);
          }}
        />

        <label className="admin-manual__label" htmlFor="bossmind-manual-body">
          {t(lang, 'bossmindManual.fieldBody')}
        </label>
        <textarea
          id="bossmind-manual-body"
          className="admin-manual__textarea"
          value={content}
          disabled={loading}
          spellCheck
          onChange={(e) => {
            setContent(e.target.value);
            setDirty(true);
          }}
        />
      </section>
    </div>
  );
}
