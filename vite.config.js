import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Must match the repo name segment: https://USER.github.io/REPO_NAME/
// https://vite.dev/config/
export default defineConfig({
  base: '/health_dashboard/',
  plugins: [react()],
})
