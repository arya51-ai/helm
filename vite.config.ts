import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Mounts the Helm Plaid connector inside the Vite dev server so `npm run dev` alone
 * serves both the app and /api/plaid — no second process, no CORS. Wrapped so any
 * connector failure only disables Plaid (frontend falls back to Yahoo/CSV); it can
 * never break the dev server. Dev-only; a static build has no /api (graceful fallback).
 */
function plaidConnector(): PluginOption {
  return {
    name: 'helm-plaid-connector',
    apply: 'serve',
    async configureServer(server) {
      try {
        const { createConnectorApp } = await import('./server/connector.mjs')
        const app = await createConnectorApp()
        server.middlewares.use('/api/plaid', app)
        server.config.logger.info('  ➜  Plaid connector mounted at /api/plaid')
      } catch (e) {
        server.config.logger.warn('Plaid connector not mounted (Plaid disabled): ' + ((e as Error)?.message ?? e))
      }
      try {
        const { createTallyApp } = await import('./server/tally.mjs')
        server.middlewares.use('/api/tally', await createTallyApp())
        server.config.logger.info('  ➜  Tally connector mounted at /api/tally')
      } catch (e) {
        server.config.logger.warn('Tally connector not mounted (Tally disabled): ' + ((e as Error)?.message ?? e))
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), plaidConnector()],
  server: { host: true },
})
