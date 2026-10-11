import { useState, useEffect } from 'react'
import { calendarService } from '../services/calendar/calendar.service.remote.js'
import { strategyService, INDUSTRIES_CHANGED } from '../services/strategy/strategy.service.remote.js'

const REFRESH_MS = 60 * 60 * 1000  // re-fetch once per hour
const WEEK_POLL_MS = 60 * 1000     // a running week, once a minute

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
    // Pythia's week (the change scan and its assessments, on "Assessed"). Null until the first one.
    const [week, setWeek] = useState(null)
    // Pythia's assessments ("Assessed") with the track record — `{ assessments, record }`, null on a failed read.
    const [assessments, setAssessments] = useState(null)
    // Pythia's themes ("Themes") — value chains with their assessments; [] until loaded or on a failed read.
    const [themes, setThemes] = useState([])

    useEffect(() => {
        let active = true
        // While a week runs on the server (many minutes), its document is re-read every WEEK_POLL_MS so the
        // board follows it; the poll stops when the week is done. Only the week, not every feed.
        let weekTimer = null
        // Per feed, the number of the latest refresh. A refresh fired by INDUSTRIES_CHANGED can overlap the
        // hourly one; only the newest read of a feed may land, or a slow old read overwrites a fresh board.
        const seq = {}

        // One load shape for every tab: flag loading, fetch, drop the result if the hook unmounted
        // mid-flight or a newer read of the same feed started. `keepOnFail`: a failed read keeps what the
        // board already shows (a refresh after an admin run must not blank the board on one network blip).
        async function load(key, fetcher, setLoading, apply, { keepOnFail = false } = {}) {
            const mine = (seq[key] = (seq[key] ?? 0) + 1)
            const current = () => active && seq[key] === mine
            setLoading(true)
            try {
                const data = await fetcher()
                if (current()) apply(data)
            } catch {
                if (current() && !keepOnFail) apply(null)
            } finally {
                if (current()) setLoading(false)
            }
        }

        const keep = { keepOnFail: true }
        const loadAssessments = () => load('assessments', strategyService.listAssessments, () => {}, (d) => setAssessments(d && Array.isArray(d.assessments) ? d : null), keep)
        const loadThemes = () => load('themes', strategyService.listThemes, () => {}, (d) => setThemes(Array.isArray(d) ? d : []), keep)

        // A running week publishes verdicts as it goes, so the poll re-reads the assessments and themes with it.
        function pollWeek() {
            loadWeek()
            loadAssessments()
            loadThemes()
        }

        function loadWeek() {
            clearTimeout(weekTimer)
            load('week', strategyService.getWeek, () => {}, (d) => {
                const w = d && typeof d === 'object' ? d : null
                setWeek(w)
                if (w && (w.running || w.status === 'running')) weekTimer = setTimeout(pollWeek, WEEK_POLL_MS)
            }, keep)
        }

        function refresh() {
            load('earnings', calendarService.getEarnings, setEarningsLoading, (d) => {
                setEarnings(d?.items ?? [])
                setEarningsFrom(d?.from ?? null)
                setEarningsTo(d?.to ?? null)
            })
            load('fed', calendarService.getFed, setFedLoading, (d) => setFed(d ?? []))
            load('ipo', calendarService.getIpo, setIpoLoading, (d) => setIpo(d ?? []))
            // Every user reads the board (2026-10-05) — the views are a broadcast.
            load('industries', strategyService.listIndustries, setIndustriesLoading, (d) => {
                setIndustriesError(!Array.isArray(d))
                if (Array.isArray(d)) setIndustries(d)
            })
            pollWeek()
        }

        refresh()
        const t = setInterval(refresh, REFRESH_MS)
        // Publishing an answer changes the board the user is about to look at — an hourly timer
        // would show them the answer they just replaced.
        window.addEventListener(INDUSTRIES_CHANGED, refresh)

        return () => { active = false; clearInterval(t); clearTimeout(weekTimer); window.removeEventListener(INDUSTRIES_CHANGED, refresh) }
    }, [])

    return { earnings, earningsFrom, earningsTo, earningsLoading, fed, fedLoading, ipo, ipoLoading, industries, industriesLoading, industriesError, week, assessments, themes }
}
