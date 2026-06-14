import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@icr/polyseg-wasm': path.resolve(__dirname, 'src/utils/polysegWasmStub.ts'),
    },
  },
  server: {
    port: 3000,
    open: true,
    // Required headers for SharedArrayBuffer support (needed by Cornerstone3D)
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
})
