import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
// Proxy API + realtime traffic to the backend so the browser only ever talks to
// its own origin (localhost:5173). Keeps the auth cookie same-origin and avoids the
// Windows Chrome `localhost` keep-alive stall on direct browser→backend requests.
const BACKEND = 'http://127.0.0.1:3030'

export default defineConfig({
	plugins: [react()],
	server: {
		proxy: {
			'/api':       { target: BACKEND, changeOrigin: true },
			'/ws':        { target: BACKEND, changeOrigin: true, ws: true },
			'/socket.io': { target: BACKEND, changeOrigin: true, ws: true },
		},
	},
	build: {
		outDir: '../botmarket-backend/public',
		emptyOutDir: true,
	},
	// Component/DOM tests (.test.jsx) run under vitest + jsdom; pure-function tests (.test.js)
	// stay on Node's built-in runner (`node --test`, see their headers). Scope vitest to .jsx so
	// the two runners don't fight over the same files. Tests import { describe, it, expect, vi }
	// from 'vitest' explicitly, so `globals` stays off; @testing-library cleanup is called per-test.
	test: {
		environment: 'jsdom',
		include: ['src/**/*.test.jsx'],
	},
})
