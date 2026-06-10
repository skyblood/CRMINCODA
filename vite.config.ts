/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Use HTTPS in dev if mkcert certs exist (Safari upgrades http→https automatically)
const certPath = path.resolve('server/cert.pem')
const keyPath  = path.resolve('server/cert-key.pem')
const hasCerts = fs.existsSync(certPath) && fs.existsSync(keyPath)
const backendProtocol = hasCerts ? 'https' : 'http'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom'],
    alias: [
      // Regex aliases so react/jsx-runtime, react/jsx-dev-runtime, and
      // react-dom/client all resolve from the SAME physical copy.
      { find: /^react$/, replacement: path.resolve('./node_modules/react') },
      { find: /^react\/(.*)$/, replacement: path.resolve('./node_modules/react/$1') },
      { find: /^react-dom$/, replacement: path.resolve('./node_modules/react-dom') },
      { find: /^react-dom\/(.*)$/, replacement: path.resolve('./node_modules/react-dom/$1') },
    ],
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'recharts',
      'react-router',
      'react-router-dom',
      'lucide-react',
      'socket.io-client',
      'zustand',
      '@dnd-kit/core',
      '@dnd-kit/sortable',
      '@dnd-kit/utilities',
    ],
  },
  // Fix: Safari doesn't have Node's `global` variable; socket.io-client and
  // other npm packages reference it — polyfill it with the standard globalThis.
  define: {
    global: 'globalThis',
  },
  build: {
    // Target Safari 14+ explicitly so esbuild transpiles any unsupported syntax.
    target: ['chrome87', 'firefox78', 'safari14', 'edge88'],
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
  server: {
    // Mirror the backend protocol so Safari doesn't get a mixed-content error
    https: hasCerts ? { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) } : undefined,
    proxy: {
      '/api': {
        target: `${backendProtocol}://localhost:3001`,
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: `${backendProtocol}://localhost:3001`,
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    }
  }
})
