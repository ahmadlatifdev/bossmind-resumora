import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  // Expose NEXT_PUBLIC_* Stripe keys to the client bundle as import.meta.env
  const env = loadEnv(mode, root, ['VITE_', 'NEXT_PUBLIC_'])
  const defineEnv = {}
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith('NEXT_PUBLIC_STRIPE_') || key.startsWith('VITE_STRIPE_')) {
      defineEnv[`import.meta.env.${key}`] = JSON.stringify(value)
    }
  }

  return {
    root,
    plugins: [react(), tailwindcss()],
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    define: defineEnv,
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(root, 'index.html'),
          pricing: path.resolve(root, 'pricing.html'),
          studio: path.resolve(root, 'studio.html'),
          videos: path.resolve(root, 'videos.html'),
          resetPassword: path.resolve(root, 'reset-password.html'),
        },
      },
    },
  }
})
