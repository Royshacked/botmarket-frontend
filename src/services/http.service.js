import Axios from 'axios'
import { API_BASE } from './config'

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