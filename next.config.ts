import type { NextConfig } from "next";
import path from "path";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  async redirects() {
    return [
      { source: "/global-reach", destination: "/", permanent: true },
      { source: "/marketing", destination: "/", permanent: true },
      { source: "/geo/:country", destination: "/", permanent: true },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
});
