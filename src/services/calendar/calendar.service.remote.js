import { httpService } from '../http.service'

// Client for the calendar API (see api/calendar on the backend). Going through
// httpService rather than raw fetch buys the 30s timeout, the stalled-socket retry,
// and the shared 401 handling — the calendar hook hand-rolled three fetches without them.

const BASE = 'api/calendar'

export const calendarService = { getEarnings, getFed, getIpo }

// Earnings carries the window it resolved ({ items, from, to }); the other two are
// item-only. Each swallows failure to an empty list so one dead tab can't blank the Radar.
async function getEarnings() {
    try {
        const data = await httpService.get(`${BASE}/earnings`)
        return {
            items: Array.isArray(data?.items) ? data.items : [],
            from:  data?.from || null,
            to:    data?.to   || null,
        }
    } catch {
        return { items: [], from: null, to: null }
    }
}

async function getFed() {
    try {
        const data = await httpService.get(`${BASE}/fed`)
        return Array.isArray(data?.items) ? data.items : []
    } catch {
        return []
    }
}

async function getIpo() {
    try {
        const data = await httpService.get(`${BASE}/ipo`)
        return Array.isArray(data?.items) ? data.items : []
    } catch {
        return []
    }
}
