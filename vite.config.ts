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
        manualChunks(id) {
          if (id.includes('node_modules/@cornerstonejs')) {
            return 'cornerstone3d'
          }
          if (
            id.includes('node_modules/cornerstone-core') ||
            id.includes('node_modules/cornerstone-tools') ||
            id.includes('node_modules/cornerstone-wado-image-loader') ||
            id.includes('node_modules/cornerstone-math') ||
            id.includes('node_modules/dicom-parser') ||
            id.includes('node_modules/hammerjs')
          ) {
            return 'cornerstone-classic'
          }
          if (
            id.includes('node_modules/three') ||
            id.includes('node_modules/@react-three')
          ) {
            return 'three'
          }
        },
      },
    },
  },
})
