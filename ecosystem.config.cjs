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
  ],
};
