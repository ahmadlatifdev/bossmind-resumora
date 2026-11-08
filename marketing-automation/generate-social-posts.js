#!/usr/bin/env node
/**
 * Resumora "Free Ads" social post generator.
 *
 * Usage:  node marketing-automation/generate-social-posts.js
 *
 * Prints ready-to-paste copy for LinkedIn, Twitter/X, Reddit, and Facebook.
 * No network calls, no keys. Tweak the value-prop block below to regenerate.
 */
import { pathToFileURL } from 'node:url';

const BRAND = {
  name: 'Resumora',
  url: 'https://resumora.net',
  tagline: 'AI Resume & Interview Masterclass',
};

// Core value proposition (single source of truth — edit here).
const VALUE_PROP = {
  features: [
    'ATS-optimized resumes & cover letters',
    'Cinematic EN/FR interview training videos',
    'Luxury executive PDF templates',
    'One-time payment — no subscription',
  ],
  pricing: 'Plans from $29 (one-time)',
  cta: 'resumora.net',
};

// --- Channel formatters -------------------------------------------------

function linkedin() {
  return [
    'Your resume and your interview are one system.',
    'Most people optimize one and wing the other.',
    '',
    `${BRAND.name} fixes both:`,
    ...VALUE_PROP.features.map((f) => `  \u2022 ${f}`),
    '',
    'One-time payment. No lock-in. No subscription.',
    `\u2192 ${BRAND.url}`,
  ].join('\n');
}

function twitter() {
  const hashtags = '#jobsearch #resume #career #ATS #interviewprep';
  return [
    `Beat the ATS + ace the interview with ${BRAND.name}.`,
    'AI resume & cover letter, EN/FR interview videos, luxury PDFs.',
    'One-time payment. No subscription.',
    hashtags,
    BRAND.url,
  ].join('\n');
}

function reddit() {
  return [
    `I built ${BRAND.name} after watching friends get ghosted by ATS filters.`,
    '',
    'It\u2019s an AI resume + interview prep tool \u2014 ATS keyword matching, EN/FR interview training videos, and downloadable PDF templates. One-time payment, no subscription.',
    '',
    'Not here to hard-sell. If you\u2019re job hunting and want feedback on your resume or how the ATS scoring works, ask away.',
    '',
    BRAND.url,
  ].join('\n');
}

function facebook() {
  return [
    `Land more interviews with ${BRAND.name} \u2728`,
    '',
    `AI-optimized resume + cover letter, interview training videos, and premium PDF templates \u2014 ${VALUE_PROP.pricing}.`,
    'One simple payment, no monthly fees.',
    `Start now at ${BRAND.url}`,
  ].join('\n');
}

// --- Output (only when run directly, not when imported) -----------------

const isDirectRun =
  typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  console.log('==============================================================');
  console.log(`LINKEDIN\n${'-'.repeat(62)}\n${linkedin()}\n`);
  console.log(`TWITTER / X\n${'-'.repeat(62)}\n${twitter()}\n`);
  console.log(`REDDIT\n${'-'.repeat(62)}\n${reddit()}\n`);
  console.log(`FACEBOOK\n${'-'.repeat(62)}\n${facebook()}\n`);
}

export { linkedin, twitter, reddit, facebook, BRAND, VALUE_PROP };
