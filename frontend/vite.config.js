import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'https://api.fileinnoutcloud.kro.kr'
  const yjsProxyTarget = env.VITE_YJS_PROXY_TARGET || 'https://api.fileinnoutcloud.kro.kr'

  return {
    base: '/',
    plugins: [vue(), vueDevTools(), tailwindcss()],
    define: {
      global: 'globalThis',
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.spec.js'],
    },
    server: {
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
          ws: true,
        },
        '/wss': {
          target: yjsProxyTarget,
          changeOrigin: true,
          secure: false,
          ws: true,
          rewrite: (path) => path.replace(/^\/wss/, '') || '/',
        },
      },
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        // Legacy `stompjs` pulls in the Node-only `net` / `websocket` modules via
        // lib/stomp-node.js. The browser uses SockJS + native WebSocket, so stub them
        // out to keep bare "net"/"websocket" specifiers out of the browser bundle.
        websocket: fileURLToPath(new URL('./src/shims/empty-module.js', import.meta.url)),
        net: fileURLToPath(new URL('./src/shims/empty-module.js', import.meta.url)),
      },
    },
  }
})
