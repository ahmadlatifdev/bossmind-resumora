import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { fetchRecommendations } from '../lib/videoApi';
import { t } from '../lib/i18n.js';
import { useLangOptional } from '../i18n/LangContext';
import './Recommendations.css';

type RecVideo = {
  id?: string;
  video_id?: string;
  title?: string;
  summary?: string;
  tags?: string[];
  thumbnail_url?: string | null;
};

export default function Recommendations() {
  const { user, loading: authLoading } = useAuth();
  const { lang } = useLangOptional();
  const [videos, setVideos] = useState<RecVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [emptyReason, setEmptyReason] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (authLoading) return undefined;
    if (!user) {
      setVideos([]);
      setLoading(false);
      setEmptyReason('');
      return undefined;
    }

    setLoading(true);
    fetchRecommendations(user)
      .then((data) => {
        if (cancelled) return;
        setVideos(Array.isArray(data.videos) ? data.videos : []);
        setEmptyReason(String(data.emptyReason || ''));
      })
      .catch(() => {
        if (cancelled) return;
        setVideos([]);
        setEmptyReason('Could not load recommendations.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  if (authLoading || loading) {
    return (
      <section className="recommendations-section" aria-busy="true">
        <h2>{t(lang, 'videos.recommendedTitle')}</h2>
        <p className="muted small">{t(lang, 'videos.recommendedLoading')}</p>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="recommendations-section">
        <h2>{t(lang, 'videos.recommendedTitle')}</h2>
        <p className="muted small">
          <Link to="/login">{t(lang, 'videos.recommendedSignIn')}</Link>
        </p>
      </section>
    );
  }

  if (!videos.length) {
    return (
      <section className="recommendations-section">
        <h2>{t(lang, 'videos.recommendedTitle')}</h2>
        <p className="muted small">{emptyReason || t(lang, 'videos.recommendedEmpty')}</p>
      </section>
    );
  }

  return (
    <section className="recommendations-section" aria-label={t(lang, 'videos.recommendedTitle')}>
      <h2>{t(lang, 'videos.recommendedTitle')}</h2>
      <div className="recommendations-rail">
        {videos.map((video) => (
          <article key={video.id || video.video_id} className="recommendations-card">
            {video.thumbnail_url ? (
              <img src={video.thumbnail_url} alt="" className="recommendations-card__thumb" />
            ) : (
              <div className="recommendations-card__thumb recommendations-card__thumb--empty" />
            )}
            <h3>{video.title || video.id}</h3>
            {video.summary ? <p className="muted small">{video.summary}</p> : null}
            {video.tags && video.tags.length ? (
              <p className="recommendations-card__tags">{video.tags.slice(0, 4).join(' · ')}</p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
