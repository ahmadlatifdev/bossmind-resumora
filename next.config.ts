import type { NextConfig } from "next";
import path from "path";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  async redirects() {
    return [
      /* Wrong bookmarks → canonical luxury homepage (BossMind protected baseline). */
      { source: "/client", destination: "/", permanent: true },
      { source: "/client/", destination: "/", permanent: true },
      { source: "/global-reach", destination: "/", permanent: true },
      { source: "/marketing", destination: "/", permanent: true },
      { source: "/geo/:country", destination: "/", permanent: true },
    ];
  },
  async rewrites() {
    return [
      /* Dynamic manifest: versioned icons + no-store (see pages/api/branding-manifest.js). */
      { source: "/manifest.webmanifest", destination: "/api/branding-manifest" },
    ];
  },
  async headers() {
    const branding = [
      { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
    ];
    return [
      { source: "/favicon.ico", headers: branding },
      { source: "/favicon.svg", headers: branding },
      { source: "/icon.svg", headers: branding },
      { source: "/favicon-16x16.png", headers: branding },
      { source: "/favicon-32x32.png", headers: branding },
      { source: "/apple-touch-icon.png", headers: branding },
      { source: "/icon-192.png", headers: branding },
      { source: "/icon-512.png", headers: branding },
      { source: "/android-chrome-192x192.png", headers: branding },
      { source: "/android-chrome-512x512.png", headers: branding },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
});
