import { useState, useEffect } from 'react'
import { calendarService } from '../services/calendar/calendar.service.remote.js'
import { strategyService, TILT_CHANGED } from '../services/strategy/strategy.service.remote.js'

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

    // Pythia's house view — the calendar's fourth tab. It is a STATE, not a schedule, but it is fed
    // here anyway because every calendar surface (the Floor rail and the Radar) already reads this
    // ONE hook: a second data path for a fourth tab would mean two refresh timers, two unmount
    // guards, and one more prop to thread by hand into each surface.
    const [tilt, setTilt]         = useState(null)
    const [tiltLoading, setTiltLoading] = useState(false)

    useEffect(() => {
        let active = true

        // One load shape for all three tabs: flag loading, fetch, drop the result if the
        // hook unmounted mid-flight. The service already degrades failures to empty.
        async function load(fetcher, setLoading, apply) {
            setLoading(true)
            try {
                const data = await fetcher()
                if (active) apply(data)
            } finally {
                if (active) setLoading(false)
            }
        }

        function refresh() {
            load(calendarService.getEarnings, setEarningsLoading, ({ items, from, to }) => {
                setEarnings(items)
                setEarningsFrom(from)
                setEarningsTo(to)
            })
            load(calendarService.getFed, setFedLoading, setFed)
            load(calendarService.getIpo, setIpoLoading, setIpo)
            load(strategyService.getCurrentTilt, setTiltLoading, setTilt)
        }

        refresh()
        const t = setInterval(refresh, REFRESH_MS)
        // Publishing supersedes the standing view, and the user is looking at the board a beat
        // later — an hourly timer would show them the view they just replaced. The other three tabs
        // need no equivalent: nothing in this app publishes an earnings date.
        window.addEventListener(TILT_CHANGED, refresh)

        return () => { active = false; clearInterval(t); window.removeEventListener(TILT_CHANGED, refresh) }
    }, [])

    return { earnings, earningsFrom, earningsTo, earningsLoading, fed, fedLoading, ipo, ipoLoading, tilt, tiltLoading }
}
