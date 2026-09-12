import { FormEvent, useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../../auth/AuthContext';
import { db } from '../../lib/firebase';

type Props = {
  sessionId: string;
  initialSummary?: string;
  onClose: () => void;
};

export default function ClientHarnessEscalation({
  sessionId,
  initialSummary = '',
  onClose,
}: Props) {
  const { user } = useAuth();
  const [email, setEmail] = useState(user?.email || '');
  const [summary, setSummary] = useState(initialSummary);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [thanks, setThanks] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedEmail = String(email || '').trim();
    const trimmedSummary = String(summary || '').trim();
    if (!trimmedEmail || !trimmedSummary) {
      setError('Email and issue summary are required.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await addDoc(collection(db, 'support_tickets'), {
        email: trimmedEmail,
        summary: trimmedSummary,
        sessionId,
        createdAt: serverTimestamp(),
        status: 'open',
      });
      setThanks(true);
      window.setTimeout(() => onClose(), 1400);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit ticket');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="client-harness-escalation-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Escalate to human support"
    >
      <div className="client-harness-escalation-modal__backdrop" onClick={onClose} />
      <div className="client-harness-escalation-modal__card">
        {thanks ? (
          <p className="client-harness-escalation-modal__thanks">
            Thank you — a teammate will follow up soon.
          </p>
        ) : (
          <>
            <header>
              <h2>Talk to a human</h2>
              <p>We will open a support ticket from this chat.</p>
              <button
                type="button"
                className="client-harness-escalation-modal__close"
                aria-label="Close"
                onClick={onClose}
              >
                ×
              </button>
            </header>
            <form onSubmit={onSubmit}>
              <label htmlFor="client-harness-escalation-email">Email</label>
              <input
                id="client-harness-escalation-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                disabled={busy}
                onChange={(e) => setEmail(e.target.value)}
              />
              <label htmlFor="client-harness-escalation-summary">Issue summary</label>
              <textarea
                id="client-harness-escalation-summary"
                rows={5}
                required
                value={summary}
                disabled={busy}
                onChange={(e) => setSummary(e.target.value)}
              />
              {error ? (
                <p className="client-harness-escalation-modal__error" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="client-harness-escalation-modal__actions">
                <button type="button" disabled={busy} onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" disabled={busy}>
                  {busy ? 'Submitting…' : 'Submit ticket'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
