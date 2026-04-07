import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev: base '/' so http://localhost:5173/ loads. Build: subpath for GitHub project Pages.
// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/' : '/health_dashboard/',
  plugins: [react()],
}))
