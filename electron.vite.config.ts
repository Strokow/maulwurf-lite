import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: ['electron-store', 'conf', 'atomically', 'dot-prop', 'env-paths', 'json-schema-typed', 'ajv']
      })
    ]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()],
    // @ts-ignore - vitest test config is not in electron-vite renderer type
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/renderer/src/tests/setup.ts']
    }
  }
})
