import Axios from 'axios'
// Explicit extension: the `.test.js` suites run under plain `node --test` (see package.json
// test:node), which does not do Vite's extensionless resolution.
import { API_BASE } from './config.js'

const axios = Axios.create({ withCredentials: true })

// `options` is merged into the axios config, for the calls that need more than a JSON
// body — e.g. a custom Content-Type + Blob (audio upload), or a longer timeout than the
// default. It exists so those calls can still come through here instead of hand-rolling
// a raw fetch and losing the retry / 401 handling below.
export const httpService = {
    get(endpoint, data, options) {
        return ajax(endpoint, 'GET', data, options)
    },
    post(endpoint, data, options) {
        return ajax(endpoint, 'POST', data, options)
    },
    put(endpoint, data, options) {
        return ajax(endpoint, 'PUT', data, options)
    },
    patch(endpoint, data, options) {
        return ajax(endpoint, 'PATCH', data, options)
    },
    delete(endpoint, data, options) {
        return ajax(endpoint, 'DELETE', data, options)
    }
}

/**
 * The message to SHOW the user for a failed httpService call.
 *
 * Lives here because this module is what throws: `ajax` rethrows the raw axios error, so the
 * server's message is at `err.response.data`, NOT `err.data`. Reaching for the latter always
 * misses and silently falls through to axios's own text — which is why a perfectly descriptive
 * "Nothing to update" reached the user as "Request failed with status code 400". One reader,
 * next to the thrower, so a caller can't spell the path wrong.
 *
 * A multi-leg order answers with per-leg `results`; the specific rejection ("paper: no live
 * price for ZTS") beats the summary line above it, so it wins when present.
 */
export function apiError(err, fallback = 'Something went wrong') {
    const data = err?.response?.data
    const leg  = Array.isArray(data?.results)
        ? data.results.find(r => r && r.ok === false && r.error)?.error
        : null
    return leg || data?.error || err?.message || fallback
}

// A request must not hang forever: without a timeout a stalled socket (the Windows
// Chrome `localhost` keep-alive stall this app already fights with the same-origin
// proxy) leaves the awaiting caller pending indefinitely — e.g. ThreadHistory stuck
// on "Loading…", or the page wedged on refresh until the window is fully closed.
const TIMEOUT_MS = 30000

async function ajax(endpoint, method = 'GET', data = null, options = {}, _retried = false) {
    const url = `${API_BASE}/${endpoint}`
    const params = (method === 'GET') ? data : null

    const config = { url, method, data, params, timeout: TIMEOUT_MS, ...options }

    try {
        const res = await axios(config)
        return res.data
    } catch (err) {
        // A timeout / dropped connection (no HTTP response) on a GET is almost always
        // a stalled reused socket — retry once so a fresh request opens a new one.
        const connStalled = err.code === 'ECONNABORTED' || !err.response
        if (method === 'GET' && connStalled && !_retried) {
            return ajax(endpoint, method, data, options, true)
        }

        console.error(`[http] ${method} ${endpoint} failed`, err)
        if (err.response && err.response.status === 401) {
            sessionStorage.clear()
            if (!window.location.pathname.startsWith('/idea/')) {
                window.location.assign('/')
            }
        }
        throw err
    }
}