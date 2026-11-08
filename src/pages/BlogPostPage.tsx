import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getBlogPost } from '../lib/blogPosts.js';
import { renderMarkdown } from '../lib/markdown.js';

export default function BlogPostPage() {
  const { slug } = useParams();
  const post = slug ? getBlogPost(slug) : null;

  useEffect(() => {
    if (post) document.title = `${post.title} | Resumora`;
    return () => {
      document.title = 'Resumora | Premium Resume Builder';
    };
  }, [post]);

  if (!post) {
    return (
      <div
        className="app-main page-content"
        style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px' }}
      >
        <h1>Article not found</h1>
        <p>
          <Link to="/blog" style={{ color: 'var(--color-gold)' }}>
            ← Back to blog
          </Link>
        </p>
      </div>
    );
  }

  const html = renderMarkdown(post.markdown);

  return (
    <div
      className="app-main page-content"
      style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px' }}
    >
      <p className="muted small" style={{ margin: '0 0 12px' }}>
        <Link to="/blog" style={{ color: 'var(--color-gold)', textDecoration: 'none' }}>
          ← All articles
        </Link>
      </p>
      <h1 style={{ margin: '0 0 8px' }}>{post.title}</h1>
      <p className="muted" style={{ opacity: 0.65, marginBottom: 24 }}>
        {post.date} · {post.readMinutes} min read
      </p>
      <div
        className="blog-post"
        style={{ lineHeight: 1.7, fontSize: '1.05rem' }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
