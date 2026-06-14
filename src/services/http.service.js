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

async function ajax(endpoint, method = 'GET', data = null) {
    const url = `${API_BASE}/${endpoint}`
    const params = (method === 'GET') ? data : null
    
    const options = { url, method, data, params }

    try {
        const res = await axios(options)
        return res.data
    } catch (err) {
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