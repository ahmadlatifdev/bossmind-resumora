/**
 * Static blog index — metadata + raw markdown loader.
 * Markdown lives in /blog/*.md (bundled at build time via Vite import.meta.glob).
 */
const POSTS = [
  {
    slug: 'beat-ats-resume-scanners',
    title: 'How to Beat ATS Resume Scanners',
    description:
      'Learn how Applicant Tracking Systems parse your resume and the exact fixes — keywords, formatting, and structure — that get you past the ATS screen.',
    date: '2026-01-15',
    readMinutes: 5,
  },
  {
    slug: 'top-star-method-interview-questions',
    title: 'Top 10 STAR Method Interview Questions (with AI Answers)',
    description:
      'The 10 most common behavioral interview questions, broken down with the STAR method — and how to structure answers an interviewer remembers.',
    date: '2026-01-20',
    readMinutes: 6,
  },
  {
    slug: 'executive-resume-templates-vs-ai-builders',
    title: 'Free Executive Resume Templates vs Paid AI Builders',
    description:
      'Are free executive resume templates enough, or is a paid AI resume builder worth it? A practical comparison of quality, ATS optimization, and time.',
    date: '2026-01-25',
    readMinutes: 5,
  },
];

const rawMarkdown = import.meta.glob('../../blog/*.md', { as: 'raw', eager: true });

function stripFrontmatterAndTitle(md) {
  let s = String(md || '');
  s = s.replace(/^---[\s\S]*?---\s*/, ''); // YAML frontmatter
  s = s.replace(/^#\s+.*\n/, ''); // leading H1 (title is rendered from metadata)
  return s;
}

function rawForSlug(slug) {
  for (const [path, content] of Object.entries(rawMarkdown)) {
    if (path.endsWith(`/${slug}.md`)) return String(content);
  }
  return '';
}

export function getBlogPosts() {
  return POSTS;
}

export function getBlogPost(slug) {
  const post = POSTS.find((p) => p.slug === slug);
  if (!post) return null;
  return { ...post, markdown: stripFrontmatterAndTitle(rawForSlug(slug)) };
}
