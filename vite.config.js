import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Use '/' for user/org Pages (https://USER.github.io/). Use '/REPO_NAME/' for project Pages.
// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react()],
})
