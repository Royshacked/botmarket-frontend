import Axios from 'axios'
import { API_BASE } from './config'

const axios = Axios.create({ withCredentials: true })

export const httpService = {
    get(endpoint, data) {
        return ajax(endpoint, 'GET', data)
    },
    post(endpoint, data) {
        return ajax(endpoint, 'POST', data)
    },
    put(endpoint, data) {
        return ajax(endpoint, 'PUT', data)
    },
    patch(endpoint, data) {
        return ajax(endpoint, 'PATCH', data)
    },
    delete(endpoint, data) {
        return ajax(endpoint, 'DELETE', data)
    }
}

// A request must not hang forever: without a timeout a stalled socket (the Windows
// Chrome `localhost` keep-alive stall this app already fights with the same-origin
// proxy) leaves the awaiting caller pending indefinitely — e.g. ThreadHistory stuck
// on "Loading…", or the page wedged on refresh until the window is fully closed.
const TIMEOUT_MS = 30000

async function ajax(endpoint, method = 'GET', data = null, _retried = false) {
    const url = `${API_BASE}/${endpoint}`
    const params = (method === 'GET') ? data : null

    const options = { url, method, data, params, timeout: TIMEOUT_MS }

    try {
        const res = await axios(options)
        return res.data
    } catch (err) {
        // A timeout / dropped connection (no HTTP response) on a GET is almost always
        // a stalled reused socket — retry once so a fresh request opens a new one.
        const connStalled = err.code === 'ECONNABORTED' || !err.response
        if (method === 'GET' && connStalled && !_retried) {
            return ajax(endpoint, method, data, true)
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