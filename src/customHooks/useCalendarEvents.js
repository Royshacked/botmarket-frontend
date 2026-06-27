import { useState, useEffect } from 'react'
import { API_BASE } from '../services/config.js'

const REFRESH_MS = 60 * 60 * 1000  // re-fetch once per hour

export function useCalendarEvents() {
    const [earnings, setEarnings]         = useState([])
    const [earningsDate, setEarningsDate] = useState(null)
    const [earningsLoading, setEarningsLoading] = useState(false)

    const [fda, setFda]           = useState([])
    const [fdaDate, setFdaDate]   = useState(null)
    const [fdaLoading, setFdaLoading] = useState(false)

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

        async function fetchFda() {
            setFdaLoading(true)
            try {
                const res  = await fetch(`${API_BASE}/api/calendar/fda`, { credentials: 'include' })
                const data = await res.json()
                if (!active) return
                setFda(Array.isArray(data.items) ? data.items : [])
                setFdaDate(data.date || null)
            } catch {
                if (active) setFda([])
            } finally {
                if (active) setFdaLoading(false)
            }
        }

        fetchEarnings()
        fetchFda()
        const t = setInterval(() => { fetchEarnings(); fetchFda() }, REFRESH_MS)

        return () => { active = false; clearInterval(t) }
    }, [])

    return { earnings, earningsDate, earningsLoading, fda, fdaDate, fdaLoading }
}
