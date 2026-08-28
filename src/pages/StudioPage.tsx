import React, { useMemo, useState } from 'react';
import SiteHeader from '../components/SiteHeader';
import { getLang, setLang, t } from '../lib/i18n.js';
import {
  parseUnstructuredResumeText,
  saveResumeDraft,
  loadResumeDraft,
  downloadTextFile,
} from '../lib/userAccess.js';
import {
  extractResumeText,
  ResumeExtractError,
  UNSUPPORTED_FILE_MESSAGE,
} from '../lib/resumeExtract.js';
import {
  verifyResumeParsing,
  verifyResumeParseRemote,
  RESUME_PARSE_ERROR_KEY,
} from '../lib/resumeVerify.js';
import { readSelectedPlan, getPlanById, localize } from '../lib/plans.js';
import { useAuth } from '../auth/AuthContext';
import { createGoogleVideo, pollGoogleVideo, createHeyGenVideo } from '../lib/veoClient.js';
import { pollHeyGenVideo } from '../lib/heygen.js';

export default function StudioPage() {
  const { user, subscriptionActive } = useAuth();
  const [lang, setLangState] = useState(() => getLang());
  const [mode, setMode] = useState('upload');
  const [fileName, setFileName] = useState('');
  const [rawText, setRawText] = useState('');
  const [parsed, setParsed] = useState(() => loadResumeDraft());
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [videoEngine, setVideoEngine] = useState('veo');
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoProgress, setVideoProgress] = useState('');
  const [refImage, setRefImage] = useState(null);
  const selectedPlan = useMemo(() => getPlanById(readSelectedPlan()), []);

  function switchLang(next) {
    setLangState(setLang(next));
  }

  async function applyVerifiedDraft(draft, { fileLabel, source }) {
    const local = verifyResumeParsing(draft);
    if (!local.ok) {
      try {
        const token = user ? await user.getIdToken() : null;
        await verifyResumeParseRemote(draft, {
          fileName: fileLabel || draft.originalFile,
          source,
          idToken: token,
        });
      } catch (_) {
        /* local fail still shown */
      }
      setParsed(null);
      setError(t(lang, RESUME_PARSE_ERROR_KEY));
      setMessage('');
      return false;
    }
    const okDraft = {
      ...draft,
      ...local.normalized,
      skills: Array.isArray(local.normalized.skills)
        ? local.normalized.skills.join(', ')
        : draft.skills,
    };
    setParsed(okDraft);
    saveResumeDraft(okDraft);
    setMessage(t(lang, 'studio.parsedOk'));
    setError('');
    return true;
  }

  async function onUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError('');
    setMessage('');
    try {
      const text = await extractResumeText(file);
      const draft = parseUnstructuredResumeText(text);
      draft.source = 'upload';
      draft.originalFile = file.name;
      draft.mimeType = file.type || '';
      draft.sizeBytes = file.size;
      setRawText(text);
      await applyVerifiedDraft(draft, { fileLabel: file.name, source: 'upload' });
    } catch (err) {
      const msg =
        err instanceof ResumeExtractError ? err.message : err?.message || UNSUPPORTED_FILE_MESSAGE;
      setError(msg);
      setParsed(null);
      setMessage('');
    } finally {
      event.target.value = '';
    }
  }

  async function onParseScratch() {
    setError('');
    const draft = parseUnstructuredResumeText(rawText);
    draft.source = 'scratch';
    await applyVerifiedDraft(draft, { fileLabel: 'scratch-paste', source: 'scratch' });
  }

  function onDownloadDraft() {
    if (!parsed) return;
    downloadTextFile('resumora-resume-draft.json', JSON.stringify(parsed, null, 2));
  }

  function onRefImage(event) {
    const file = event.target.files?.[0];
    if (!file) {
      setRefImage(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      setRefImage({ base64, mimeType: file.type || 'image/png', name: file.name });
    };
    reader.readAsDataURL(file);
  }

  async function onGenerateVideo() {
    setError('');
    setMessage('');
    setVideoUrl('');
    setVideoProgress('');
    const prompt = String(videoPrompt || '').trim();
    if (prompt.length < 8) {
      setError(t(lang, 'studio.videoPromptRequired'));
      return;
    }
    if (!user) {
      setError(t(lang, 'studio.videoSignIn'));
      return;
    }
    if (!subscriptionActive) {
      setError(t(lang, 'studio.videoNeedPlan'));
      return;
    }
    setVideoBusy(true);
    try {
      if (videoEngine === 'heygen') {
        setVideoProgress(t(lang, 'studio.videoStarting'));
        const started = await createHeyGenVideo({
          prompt,
          engine: 'heygen',
          title: parsed?.fullName ? `Resume video — ${parsed.fullName}` : 'Resume Studio video',
        });
        const videoId = started.video_id || started.data?.video_id || started.id;
        if (!videoId && (started.video_url || started.url)) {
          setVideoUrl(started.video_url || started.url);
          setMessage(t(lang, 'studio.videoReady'));
          return;
        }
        if (!videoId) throw new Error(t(lang, 'studio.videoFailed'));
        const done = await pollHeyGenVideo(videoId, {
          onProgress: () => setVideoProgress(t(lang, 'studio.videoPolling')),
        });
        const url = done.video_url || done.data?.video_url || done.url || '';
        if (!url) throw new Error(t(lang, 'studio.videoFailed'));
        setVideoUrl(url);
        setMessage(t(lang, 'studio.videoReady'));
      } else {
        setVideoProgress(t(lang, 'studio.videoStarting'));
        const started = await createGoogleVideo({
          prompt,
          engine: 'veo',
          agent: true,
          imageBase64: refImage?.base64,
          mimeType: refImage?.mimeType,
          durationSeconds: 8,
          aspectRatio: '16:9',
        });
        if (started.fallback?.messageKey || started.code === 'GENERATION_FAILED') {
          throw new Error(t(lang, 'videos.temporarilyUnavailable'));
        }
        if (started.videoUrl) {
          setVideoUrl(started.videoUrl);
          setMessage(t(lang, 'studio.videoReady'));
          return;
        }
        const operationName = started.operationName;
        if (!operationName && !started.done) {
          throw new Error(t(lang, 'videos.temporarilyUnavailable'));
        }
        if (operationName) {
          const done = await pollGoogleVideo(operationName, {
            onProgress: (s) =>
              setVideoProgress(
                s.status === 'processing'
                  ? t(lang, 'studio.videoPolling')
                  : t(lang, 'studio.videoStarting')
              ),
          });
          if (!done.videoUrl) throw new Error(t(lang, 'videos.temporarilyUnavailable'));
          setVideoUrl(done.videoUrl);
          setMessage(t(lang, 'studio.videoReady'));
        }
      }
    } catch (err) {
      if (err?.code === 'GENERATION_FAILED' || err?.fallback?.messageKey) {
        setError(t(lang, 'videos.temporarilyUnavailable'));
      } else {
        setError(err?.message || t(lang, 'studio.videoFailed'));
      }
    } finally {
      setVideoBusy(false);
      setVideoProgress('');
    }
  }

  return (
    <div className="app-shell">
      <SiteHeader lang={lang} onLangChange={switchLang} currentPath="/studio" />

      <main className="app-main">
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
              <input
                type="file"
                accept=".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                onChange={onUpload}
              />
              {t(lang, 'studio.chooseFile')}
            </label>
            <p className="muted small">{t(lang, 'studio.supportedTypes')}</p>
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

        {error ? (
          <p className="banner err" role="alert">
            {error}
          </p>
        ) : null}
        {message ? <p className="banner ok">{message}</p> : null}

        {parsed ? (
          <section className="panel parsed">
            <h2>{t(lang, 'studio.parsed')}</h2>
            <dl>
              <dt>{t(lang, 'studio.name')}</dt>
              <dd>{parsed.fullName || '—'}</dd>
              <dt>Email</dt>
              <dd>{parsed.email || '—'}</dd>
              <dt>{t(lang, 'studio.phone')}</dt>
              <dd>{parsed.phone || '—'}</dd>
              <dt>{t(lang, 'studio.skills')}</dt>
              <dd>{parsed.skills || '—'}</dd>
              <dt>{t(lang, 'studio.summary')}</dt>
              <dd>{parsed.summary || '—'}</dd>
            </dl>
            <button type="button" className="primary" onClick={onDownloadDraft}>
              {t(lang, 'studio.downloadDraft')}
            </button>
          </section>
        ) : null}

        <section className="panel" aria-labelledby="studio-video-engine-title">
          <h2 id="studio-video-engine-title">{t(lang, 'studio.videoTitle')}</h2>
          <p className="muted small">{t(lang, 'studio.videoLead')}</p>

          <div className="mode-tabs" role="radiogroup" aria-label={t(lang, 'studio.videoEngine')}>
            <button
              type="button"
              data-active={videoEngine === 'veo'}
              onClick={() => setVideoEngine('veo')}
            >
              {t(lang, 'studio.engineVeo')}
            </button>
            <button
              type="button"
              data-active={videoEngine === 'heygen'}
              onClick={() => setVideoEngine('heygen')}
            >
              {t(lang, 'studio.engineHeygen')}
            </button>
          </div>

          <label className="muted small" htmlFor="studio-video-prompt">
            {t(lang, 'studio.videoPrompt')}
          </label>
          <textarea
            id="studio-video-prompt"
            rows={5}
            value={videoPrompt}
            onChange={(e) => setVideoPrompt(e.target.value)}
            placeholder={t(lang, 'studio.videoPromptPlaceholder')}
            disabled={videoBusy}
          />

          {videoEngine === 'veo' ? (
            <label className="file-label" style={{ marginTop: 12 }}>
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onRefImage} />
              {t(lang, 'studio.videoRefImage')}
              {refImage?.name ? ` — ${refImage.name}` : ''}
            </label>
          ) : null}

          <div className="row-actions" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="primary"
              disabled={videoBusy}
              onClick={() => void onGenerateVideo()}
            >
              {videoBusy ? t(lang, 'studio.videoWorking') : t(lang, 'studio.videoGenerate')}
            </button>
          </div>
          {videoProgress ? <p className="muted small">{videoProgress}</p> : null}
          {videoUrl ? (
            <div style={{ marginTop: 16 }}>
              <video src={videoUrl} controls playsInline style={{ width: '100%', maxWidth: 720 }} />
              <p className="muted small">
                <a href={videoUrl} target="_blank" rel="noopener noreferrer">
                  {t(lang, 'studio.videoOpen')}
                </a>
              </p>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
