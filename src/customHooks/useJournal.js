import { useState, useEffect, useCallback, useRef } from 'react'
import { mentorService } from '../services/mentor/mentor.service.remote'
import { journalKey } from '../cmps/TradeIdeas/monitorJournal.utils.js'

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
    // Another setup: nothing of the last one's history, and its end, carries over (CR 2026-11-19).
    useEffect(() => {
        setRows([])
        setDone(false)
    }, [id])

    useEffect(() => {
        if (!id) return
        let alive = true
        ;(async () => {
            let head
            try {
                head = await mentorService.getSetupJournal(id, { limit: PAGE })
            } catch {
                return   // the next wake's version bump fetches it again
            }
            if (!alive) return
            setRows(prev => {
                const seen = new Set(head.map(journalKey))
                // `<=`: a twin of the head's oldest row that fell onto the next page is kept.
                const older = prev.filter(r => !seen.has(journalKey(r)) && (head.length ? r.at <= head[head.length - 1].at : true))
                return [...head, ...older]
            })
            if (head.length < PAGE) setDone(true)
        })()
        return () => { alive = false }
    }, [id, version])

    const loadOlder = useCallback(async () => {
        if (!id || done || inFlight.current) return
        const last = rows[rows.length - 1]
        const oldest = last?.at
        if (!oldest) return
        inFlight.current = true
        setLoading(true)
        try {
            // The cursor is the oldest row's (at, id): strictly older, so a page never repeats or skips a
            // row however many share a millisecond. Rows already shown are still dropped here by key — a
            // server without the id cursor sends the boundary millisecond again.
            const page = await mentorService.getSetupJournal(id, { before: oldest, beforeId: last.id, limit: PAGE })
            const have = new Set(rows.map(journalKey))
            const fresh = page.filter(r => !have.has(journalKey(r)))
            setRows(prev => {
                const keys = new Set(prev.map(journalKey))
                return [...prev, ...fresh.filter(r => !keys.has(journalKey(r)))]
            })
            // A short page is the end; so is a full page with nothing new (a whole page on one
            // millisecond — the cursor could not move past it).
            if (page.length < PAGE || fresh.length === 0) setDone(true)
        } catch {
            // A failed page leaves "older" in place to try again.
        } finally {
            inFlight.current = false
            setLoading(false)
        }
    }, [id, rows, done])

    return { rows, loading, done, loadOlder }
}
