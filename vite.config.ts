import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Forward API calls to the local Express backend so the browser never has
    // to deal with cross-origin scraping/CORS.
    proxy: {
      '/api': 'http://localhost:5174',
    },
  },
})
