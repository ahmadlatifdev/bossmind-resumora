/**
 * PM2 profile for Railway-style Node hosting or Windows/Linux bare metal.
 * Usage: pm2 start ecosystem.config.cjs && pm2 save
 * Production entry: server.js (matches npm run start).
 */
module.exports = {
  apps: [
    {
      name: "resumora",
      cwd: __dirname,
      script: "./server.js",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "900M",
      restart_delay: 3500,
      exp_backoff_restart_delay: 1200,
      kill_timeout: 14000,
      listen_timeout: 25000,
      shutdown_with_message: true,
      env: {
        NODE_ENV: "production",
      },
      env_development: {
        NODE_ENV: "development",
      },
    },
    {
      name: "bossmind-autonomous-runtime",
      cwd: __dirname,
      script: "./scripts/bossmind-autonomous-runtime.mjs",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "700M",
      restart_delay: 3000,
      exp_backoff_restart_delay: 1200,
      kill_timeout: 12000,
      env: {
        NODE_ENV: "production",
        BOSSMIND_PROJECT_KEY: "resumora",
        BOSSMIND_AUTONOMOUS_LOOP_MS: "60000",
        BOSSMIND_RUNTIME_SYNC_MS: "45000",
        BOSSMIND_AUTHORITY_PROMOTE_ON_VERIFY: "1",
        BOSSMIND_AUTONOMY_MIN_SCORE: "90",
      },
      env_development: {
        NODE_ENV: "development",
        BOSSMIND_PROJECT_KEY: "resumora",
        BOSSMIND_AUTONOMOUS_LOOP_MS: "30000",
        BOSSMIND_RUNTIME_SYNC_MS: "30000",
      },
    },
  ],
};
