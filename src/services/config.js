// Base URL for the backend API.
// Empty in production (same origin); explicit host in dev (Vite dev server → backend).
export const API_BASE = import.meta.env.PROD ? '' : 'http://localhost:3030'
