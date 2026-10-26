import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // FFmpeg ships a worker entry that Vite's dependency optimizer can misplace.
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/core'] },
  // Keep using the Vite page on :5173 while Vercel Functions run locally on :3001.
  server: {
    watch: {
      // Vercel creates a temporary copy of the project under .vercel/cache.
      // Watching that generated tree can exhaust macOS file watchers.
			ignored: ['**/.vercel/**'],
    },
  },
  base: process.env.GITHUB_PAGES === 'true' ? `/${process.env.REPO_NAME || ''}/` : '/',
})
