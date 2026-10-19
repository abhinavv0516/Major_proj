import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  // In development the UI calls /api on its own origin and Vite forwards it to FastAPI,
  // so there are no cross-origin requests (also works for the live SSE stream).
  server: {
    proxy: {
      '/api': { target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
})
