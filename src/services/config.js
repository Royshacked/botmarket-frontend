// Base URL for the backend API.
// Empty in BOTH dev and prod → always same-origin. In dev the Vite server proxies
// /api, /ws and /socket.io to the backend (see vite.config.js). Same-origin keeps
// the auth cookie working (no cross-site SameSite block) and avoids the Windows
// Chrome `localhost` keep-alive stall on direct browser→backend requests.
export const API_BASE = ''
