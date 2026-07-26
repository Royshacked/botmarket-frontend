import { useState, useEffect } from 'react'
import { calendarService } from '../services/calendar/calendar.service.remote.js'

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
        }

        refresh()
        const t = setInterval(refresh, REFRESH_MS)

        return () => { active = false; clearInterval(t) }
    }, [])

    return { earnings, earningsFrom, earningsTo, earningsLoading, fed, fedLoading, ipo, ipoLoading }
}
