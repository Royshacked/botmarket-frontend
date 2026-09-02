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
})
