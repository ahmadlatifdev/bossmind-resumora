#!/usr/bin/env node
/**
 * "Post Everywhere" — fire the generated copy to all platforms at once.
 *
 * Usage:  node marketing-automation/publish-everywhere.js
 * (Loads credentials from repo-root `.env`; unconfigured channels are skipped.)
 */
import { linkedin, twitter, reddit, facebook } from './generate-social-posts.js';
import { postTwitter, postLinkedIn, postFacebook } from './auto-poster.js';

async function main() {
  const jobs = [
    ['twitter', () => postTwitter(twitter())],
    ['linkedin', () => postLinkedIn(linkedin())],
    ['facebook', () => postFacebook(facebook())],
  ];

  const results = {};
  for (const [channel, fn] of jobs) {
    try {
      results[channel] = await fn();
    } catch (err) {
      results[channel] = { error: err.message };
      console.error(`[publish-everywhere] ${channel} failed:`, err.message);
    }
  }

  console.log('\nPublish results:');
  console.log(JSON.stringify(results, null, 2));
  console.log(
    '\n(Reddit text — post manually, r/jobs or r/resumes, after reviewing community rules:)'
  );
  console.log(reddit());
}

main().catch((err) => {
  console.error('[publish-everywhere] fatal:', err.message);
  process.exitCode = 1;
});
