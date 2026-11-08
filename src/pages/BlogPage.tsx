import { Link } from 'react-router-dom';
import { getBlogPosts } from '../lib/blogPosts.js';

export default function BlogPage() {
  const posts = getBlogPosts();
  return (
    <div
      className="app-main page-content"
      style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px' }}
    >
      <h1>Resumora Blog</h1>
      <p className="lead" style={{ opacity: 0.85 }}>
        Resume, interview, and career advice — free.
      </p>
      <div style={{ display: 'grid', gap: 16 }}>
        {posts.map((p) => (
          <article
            key={p.slug}
            style={{
              border: '1px solid rgba(212, 175, 55, 0.28)',
              borderRadius: 14,
              padding: 20,
              background: 'rgba(255,255,255,0.03)',
            }}
          >
            <h2 style={{ margin: '0 0 8px' }}>
              <Link
                to={`/blog/${p.slug}`}
                style={{ color: 'var(--color-gold)', textDecoration: 'none' }}
              >
                {p.title}
              </Link>
            </h2>
            <p style={{ margin: '0 0 10px', opacity: 0.85 }}>{p.description}</p>
            <p className="muted small" style={{ margin: 0, opacity: 0.6 }}>
              {p.date} · {p.readMinutes} min read
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
