import { useState, useEffect } from 'react'
import { calendarService } from '../services/calendar/calendar.service.remote.js'
import { strategyService, INDUSTRIES_CHANGED } from '../services/strategy/strategy.service.remote.js'

const REFRESH_MS = 60 * 60 * 1000  // re-fetch once per hour

export function useCalendarEvents() {
    const [earnings, setEarnings]         = useState([])
    const [earningsFrom, setEarningsFrom] = useState(null)
    const [earningsTo, setEarningsTo]     = useState(null)
    const [earningsLoading, setEarningsLoading] = useState(false)

    const [fed, setFed]           = useState([])
    const [fedLoading, setFedLoading] = useState(false)

    const [ipo, setIpo]           = useState([])
    const [ipoLoading, setIpoLoading] = useState(false)

    // Pythia's industry views — the calendar's Forecasts tab. A STATE, not a schedule, but fed here
    // because every calendar surface (the Floor rail and the Radar) already reads this ONE hook: a
    // second data path would mean two refresh timers, two unmount guards and one more prop to thread.
    const [industries, setIndustries]               = useState([])
    const [industriesLoading, setIndustriesLoading] = useState(false)
    // A failed read is NOT an empty board — "the engine has not run" would be a false statement.
    const [industriesError, setIndustriesError]     = useState(false)

    useEffect(() => {
        let active = true

        // One load shape for every tab: flag loading, fetch, drop the result if the hook unmounted
        // mid-flight. The service already degrades failures to empty.
        async function load(fetcher, setLoading, apply) {
            setLoading(true)
            try {
                const data = await fetcher()
                if (active) apply(data)
            } catch {
                if (active) apply(null)
            } finally {
                if (active) setLoading(false)
            }
        }

        function refresh() {
            load(calendarService.getEarnings, setEarningsLoading, (d) => {
                setEarnings(d?.items ?? [])
                setEarningsFrom(d?.from ?? null)
                setEarningsTo(d?.to ?? null)
            })
            load(calendarService.getFed, setFedLoading, (d) => setFed(d ?? []))
            load(calendarService.getIpo, setIpoLoading, (d) => setIpo(d ?? []))
            // Every user reads the board (2026-10-05) — the views are a broadcast.
            load(strategyService.listIndustries, setIndustriesLoading, (d) => {
                setIndustriesError(!Array.isArray(d))
                if (Array.isArray(d)) setIndustries(d)
            })
        }

        refresh()
        const t = setInterval(refresh, REFRESH_MS)
        // Publishing an answer changes the board the user is about to look at — an hourly timer
        // would show them the answer they just replaced.
        window.addEventListener(INDUSTRIES_CHANGED, refresh)

        return () => { active = false; clearInterval(t); window.removeEventListener(INDUSTRIES_CHANGED, refresh) }
    }, [])

    return { earnings, earningsFrom, earningsTo, earningsLoading, fed, fedLoading, ipo, ipoLoading, industries, industriesLoading, industriesError }
}
