import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // Defaults keep current behavior.
  // Override locally with:
  //   VITE_BACKEND_HTTP=http://localhost:8081
  //   VITE_BACKEND_WS=ws://localhost:8081
  const httpTarget = env.VITE_BACKEND_HTTP || 'https://localhost:8080'
  const wsTarget = env.VITE_BACKEND_WS || httpTarget.replace(/^http/, 'ws')

  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          // Merge very small chunks to avoid producing hundreds of tiny files.
          // (Rollup option; remove if it ever causes issues.)
          experimentalMinChunkSize: 20000,
          manualChunks(id) {
            if (!id.includes('node_modules')) return

            // Keep chunks reasonably sized and cache-friendly.
            // Use a few stable buckets + per-package split for the rest.
            if (id.includes('@refinedev/')) return 'vendor-refine'
            if (id.includes('antd/')) return 'vendor-antd'
            if (id.includes('@ant-design/icons')) return 'vendor-antd-icons'
            if (id.includes('react-dom') || id.includes('react/')) return 'vendor-react'

            if (id.includes('react-router-dom') || id.includes('react-router/') || id.includes('@remix-run/router')) {
              return 'vendor-router'
            }

            if (id.includes('i18next') || id.includes('react-i18next') || id.includes('i18next-browser-languagedetector')) {
              return 'vendor-i18n'
            }

            if (
              id.includes('react-markdown') ||
              id.includes('remark-') ||
              id.includes('rehype-') ||
              id.includes('unified') ||
              id.includes('micromark') ||
              id.includes('mdast-') ||
              id.includes('hast-') ||
              id.includes('vfile')
            ) {
              return 'vendor-markdown'
            }

            if (id.includes('axios') || id.includes('lodash-es') || id.includes('qs') || id.includes('dayjs') || id.includes('papaparse')) {
              return 'vendor-utils'
            }

            // Split remaining deps by package to avoid a mega "vendor" chunk.
            const rel = id.split('node_modules/')[1]
            if (!rel) return
            const parts = rel.split('/')
            const pkg = parts[0]?.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]
            if (!pkg) return

            // Some deps routinely end up fully tree-shaken and would produce empty chunks
            // when forced into their own manual chunk.
            const emptyChunkPackages = new Set([
              '@ctrl/tinycolor',
              'dequal',
              'html-parse-stringify',
              'json2mq',
              'path-to-regexp',
              '@rc-component/mini-decimal',
              'safe-stable-stringify',
              'string-convert',
              'void-elements',
            ])
            if (emptyChunkPackages.has(pkg)) return

            const safe = pkg.replace('@', '').replace('/', '_')
            return `vendor-${safe}`
          },
        },
      },
    },
    server: {
      proxy: {
        '/api': {
          // Backend Spring Boot runs on 8080 by default.
          // 8088 is typically an nginx gateway port and may 502 in local dev.
          target: httpTarget,
          changeOrigin: true
        },
        '/ws': {
          target: wsTarget,
          ws: true
        }
      }
    }
  }
})
