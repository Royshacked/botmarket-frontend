import { useState, useEffect } from 'react'
import { API_BASE } from '../services/config.js'

const REFRESH_MS = 60 * 60 * 1000  // re-fetch once per hour

export function useCalendarEvents() {
    const [earnings, setEarnings]         = useState([])
    const [earningsDate, setEarningsDate] = useState(null)
    const [earningsLoading, setEarningsLoading] = useState(false)

    const [fed, setFed]           = useState([])
    const [fedLoading, setFedLoading] = useState(false)

    const [ipo, setIpo]           = useState([])
    const [ipoLoading, setIpoLoading] = useState(false)

    useEffect(() => {
        let active = true

        async function fetchEarnings() {
            setEarningsLoading(true)
            try {
                const res  = await fetch(`${API_BASE}/api/calendar/earnings`, { credentials: 'include' })
                const data = await res.json()
                if (!active) return
                setEarnings(Array.isArray(data.items) ? data.items : [])
                setEarningsDate(data.date || null)
            } catch {
                if (active) setEarnings([])
            } finally {
                if (active) setEarningsLoading(false)
            }
        }

        async function fetchFed() {
            setFedLoading(true)
            try {
                const res  = await fetch(`${API_BASE}/api/calendar/fed`, { credentials: 'include' })
                const data = await res.json()
                if (!active) return
                setFed(Array.isArray(data.items) ? data.items : [])
            } catch {
                if (active) setFed([])
            } finally {
                if (active) setFedLoading(false)
            }
        }

        async function fetchIpo() {
            setIpoLoading(true)
            try {
                const res  = await fetch(`${API_BASE}/api/calendar/ipo`, { credentials: 'include' })
                const data = await res.json()
                if (!active) return
                setIpo(Array.isArray(data.items) ? data.items : [])
            } catch {
                if (active) setIpo([])
            } finally {
                if (active) setIpoLoading(false)
            }
        }

        fetchEarnings()
        fetchFed()
        fetchIpo()
        const t = setInterval(() => { fetchEarnings(); fetchFed(); fetchIpo() }, REFRESH_MS)

        return () => { active = false; clearInterval(t) }
    }, [])

    return { earnings, earningsDate, earningsLoading, fed, fedLoading, ipo, ipoLoading }
}
