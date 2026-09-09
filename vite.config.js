import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

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
	// TWO RUNNERS, SPLIT BY EXTENSION, and vitest has to be told where its half ends.
	//
	//   *.test.jsx  vitest + @testing-library — anything that renders a component
	//   *.test.js   node:test — pure functions, run by `npm run test:node`
	//
	// The split is exact today (58 and 29 files, no crossover). Vitest's default include
	// also matches **/*.test.js, so without `include` it collects all 29 node:test files,
	// finds no vitest suite in them and reports 29 failures that are nothing of the kind.
	//
	// `environment` matters just as much: component tests render into a DOM, and the
	// default node environment has no `document`, so every .test.jsx dies at its first
	// render(). Both were missing, so the whole vitest half of the suite was dead —
	// including the ZoneEditor tests that would have caught a missing click handler.
	// jsdom is already a devDependency; only the wiring was absent.
	test: {
		environment: 'jsdom',
		include: ['src/**/*.test.jsx'],
	},
})
