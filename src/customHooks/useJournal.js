import { useState, useEffect, useCallback, useRef } from 'react'
import { mentorService } from '../services/mentor/mentor.service.remote'

const PAGE = 50

/**
 * Talos's journal for one setup — its own collection now, read newest-first through
 * `GET /api/setups/:id/journal` and paged by the oldest row's `at`.
 *
 * `version` is what makes it live: pass `setup.monitor_state.check_count`, which every wake
 * bumps, and the head of the journal is re-fetched whenever the pop-out's own poll sees a new wake.
 * No socket event needed — the setup document already changes on every read.
 *
 * @param {string} id       the setup id
 * @param {number} version  a value that changes when the journal may have grown
 * @returns {{ rows: object[], loading: boolean, done: boolean, loadOlder: () => Promise<void> }}
 */
export function useJournal(id, version) {
    const [rows, setRows]       = useState([])
    const [loading, setLoading] = useState(false)
    const [done, setDone]       = useState(false)
    const inFlight = useRef(false)

    // The head: newest page, replacing whatever was shown. Older pages already loaded are kept
    // beneath it by `at`, so a refresh never collapses a scrolled-back history.
    useEffect(() => {
        if (!id) return
        let alive = true
        ;(async () => {
            const head = await mentorService.getSetupJournal(id, { limit: PAGE })
            if (!alive) return
            setRows(prev => {
                const seen = new Set(head.map(r => r.at))
                const older = prev.filter(r => !seen.has(r.at) && (head.length ? r.at < head[head.length - 1].at : true))
                return [...head, ...older]
            })
            if (head.length < PAGE) setDone(true)
        })()
        return () => { alive = false }
    }, [id, version])

    const loadOlder = useCallback(async () => {
        if (!id || done || inFlight.current) return
        const oldest = rows[rows.length - 1]?.at
        if (!oldest) return
        inFlight.current = true
        setLoading(true)
        try {
            const page = await mentorService.getSetupJournal(id, { before: oldest, limit: PAGE })
            setRows(prev => [...prev, ...page.filter(r => !prev.some(p => p.at === r.at))])
            if (page.length < PAGE) setDone(true)
        } finally {
            inFlight.current = false
            setLoading(false)
        }
    }, [id, rows, done])

    return { rows, loading, done, loadOlder }
}
