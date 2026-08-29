import React, { useMemo, useState } from 'react';
import { t } from '../lib/i18n.js';
import { useLangOptional } from '../i18n/LangContext';
import {
  parseUnstructuredResumeText,
  saveResumeDraft,
  loadResumeDraft,
  downloadTextFile,
} from '../lib/userAccess.js';
import { readSelectedPlan, getPlanById, localize } from '../lib/plans.js';
import { recordClientServiceEvent } from '../lib/billingApi.js';

export default function StudioPage() {
  const { lang } = useLangOptional();
  const [mode, setMode] = useState('upload');
  const [fileName, setFileName] = useState('');
  const [rawText, setRawText] = useState('');
  const [parsed, setParsed] = useState(() => loadResumeDraft());
  const [message, setMessage] = useState('');
  const selectedPlan = useMemo(() => getPlanById(readSelectedPlan()), []);

  async function onUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.txt') || lower.endsWith('.md') || lower.endsWith('.csv')) {
      const text = await file.text();
      const draft = parseUnstructuredResumeText(text);
      draft.source = 'upload_text';
      draft.originalFile = file.name;
      setParsed(draft);
      saveResumeDraft(draft);
      setMessage(t(lang, 'studio.parsedOk'));
      void recordClientServiceEvent('resume_uploaded', {
        fileName: file.name,
        source: draft.source,
      });
      return;
    }
    const draft = {
      source: 'upload_binary',
      originalFile: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      fullName: '',
      email: '',
      phone: '',
      summary: t(lang, 'studio.uploadOk'),
      skills: '',
      experience: [],
      rawText: '',
    };
    setParsed(draft);
    saveResumeDraft(draft);
    setMessage(t(lang, 'studio.uploadOk'));
    void recordClientServiceEvent('resume_uploaded', {
      fileName: file.name,
      source: 'upload_binary',
    });
  }

  function onParseScratch() {
    const draft = parseUnstructuredResumeText(rawText);
    setParsed(draft);
    saveResumeDraft(draft);
    setMessage(t(lang, 'studio.parsedOk'));
  }

  function onDownloadDraft() {
    if (!parsed) return;
    downloadTextFile('resumora-resume-draft.json', JSON.stringify(parsed, null, 2));
  }

  return (
    <div className="app-main page-content">
      <h1>{t(lang, 'studio.title')}</h1>
      <p className="lead">{t(lang, 'studio.lead')}</p>

      {selectedPlan ? (
        <p className="plan-chip">
          {t(lang, 'studio.selectedPlan')}{' '}
          <strong>
            {localize(selectedPlan.name, lang)} ({selectedPlan.priceLabel})
          </strong>
        </p>
      ) : (
        <p className="plan-chip warn">
          {t(lang, 'studio.noPlan')} <a href="/pricing">{t(lang, 'studio.choosePlan')}</a>
        </p>
      )}

      <div className="mode-tabs" role="tablist">
        <button type="button" data-active={mode === 'upload'} onClick={() => setMode('upload')}>
          {t(lang, 'studio.upload')}
        </button>
        <button type="button" data-active={mode === 'scratch'} onClick={() => setMode('scratch')}>
          {t(lang, 'studio.scratch')}
        </button>
      </div>

      {mode === 'upload' ? (
        <section className="panel">
          <label className="file-label">
            <input type="file" accept=".pdf,.doc,.docx,.txt,.md" onChange={onUpload} />
            {t(lang, 'studio.chooseFile')}
          </label>
          {fileName ? <p className="muted">{fileName}</p> : null}
        </section>
      ) : (
        <section className="panel">
          <textarea
            rows={12}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={t(lang, 'studio.placeholder')}
          />
          <button type="button" className="primary" onClick={onParseScratch}>
            {t(lang, 'studio.structure')}
          </button>
        </section>
      )}

      {message ? <p className="banner ok">{message}</p> : null}

      {parsed ? (
        <section className="panel parsed">
          <h2>{t(lang, 'studio.parsed')}</h2>
          <dl>
            <dt>{t(lang, 'studio.name')}</dt>
            <dd>{parsed.fullName || '—'}</dd>
            <dt>{t(lang, 'studio.email')}</dt>
            <dd>{parsed.email || '—'}</dd>
            <dt>{t(lang, 'studio.phone')}</dt>
            <dd>{parsed.phone || '—'}</dd>
            <dt>{t(lang, 'studio.summary')}</dt>
            <dd>{parsed.summary || '—'}</dd>
          </dl>
          <button type="button" className="primary" onClick={onDownloadDraft}>
            {t(lang, 'studio.downloadDraft')}
          </button>
        </section>
      ) : null}
    </div>
  );
}
