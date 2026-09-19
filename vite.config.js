import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { VitePWA } from 'vite-plugin-pwa'

// Proxy API + realtime traffic to the backend so the browser only ever talks to
// its own origin (localhost:5173). Keeps the auth cookie same-origin and avoids the
// Windows Chrome `localhost` keep-alive stall on direct browser→backend requests.
const BACKEND = 'http://127.0.0.1:3030'

// INSTALLABLE, NOT OFFLINE. The service worker exists so Chrome/Edge offer "Install app" on
// desktop and Android (and so Web Push has somewhere to land later). It precaches the app SHELL —
// the built js/css/html and the icons — and nothing else. A trading app that answers from a cache
// is worse than one that fails: a stale price, a stale card, a "pending" that already fired. So
// `/api`, `/ws` and `/socket.io` are on the navigate denylist and have NO runtime caching rule —
// every request goes to the network, exactly as before the worker existed.
//
// `autoUpdate`: a new deploy's worker takes over on the next load without a prompt. The app has no
// "you have unsaved work" state a forced refresh could lose — a desk's draft lives on the server.
//
// Exported so the config test can read the manifest and the denylist without running a build.
export const PWA = {
	registerType: 'autoUpdate',
	manifest: {
		name:             'axl',
		short_name:       'axl',
		description:      'AI-powered trading desks — monitor your setups, get the call, confirm the order.',
		start_url:        '/',
		scope:            '/',
		display:          'standalone',
		orientation:      'any',
		theme_color:      '#06080b',   // --bg-base
		background_color: '#06080b',
		icons: [
			{ src: '/img/pwa-192.png',          sizes: '192x192', type: 'image/png' },
			{ src: '/img/pwa-512.png',          sizes: '512x512', type: 'image/png' },
			{ src: '/img/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
		],
	},
	workbox: {
		globPatterns: ['**/*.{js,css,html,svg,png}'],
		navigateFallbackDenylist: [/^\/api\//, /^\/ws/, /^\/socket\.io/],
		// The Google Fonts stylesheets + woff2 files, so an installed app does not open in the
		// fallback font when the network is slow. Bounded, and the only runtime cache there is.
		runtimeCaching: [
			{
				urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
				handler:    'CacheFirst',
				options:    { cacheName: 'google-fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
			},
		],
	},
	// Off in dev: a worker under the Vite dev server fights HMR and the proxy above.
	devOptions: { enabled: false },
}

export default defineConfig({
	plugins: [react(), VitePWA(PWA)],
	// The `rem()` helper (setup/_functions.scss) in EVERY stylesheet, not just the ones main.scss
	// chains together. Component stylesheets are imported from their JSX and compile on their own,
	// so a `rem(13px)` in ChatPanel.scss used to resolve to Sass's built-in math `rem` (modulo) and
	// fail with "2 arguments required". Prepended here, the helper is one definition app-wide —
	// main.scss no longer @imports it separately.
	css: {
		preprocessorOptions: {
			scss: { additionalData: '@use "/src/assets/styles/setup/functions" as *;\n' },
		},
	},
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
		// A FLAKE THAT IS NOT A BUG. The default 5s is wall clock, and 59 files run in
		// parallel workers on one machine — so a test that takes 30ms alone can cross 5s
		// while the others contend for the CPU. It surfaced four times in one session on a
		// DIFFERENT test each run (FloorLists, MentorPanel, AxlHub, AetherCandidates), every
		// one passing in isolation immediately after. That pattern is scheduling, not code,
		// and a suite that fails at random teaches the reader to ignore red.
		testTimeout: 20000,
	},
})
