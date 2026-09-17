import { useState, useEffect, useRef, useCallback } from 'react'
import { aetherService } from '../services/aether/aether.service.remote.js'
import { chatWsService } from '../services/chat/chatWs.service.js'
import { apiError } from '../services/http.service.js'

// The server's word for a discovery run changing state — the same shape GET /discover
// answers, pushed to everyone connected at each stage and at the end.
export const DISCOVERY_EVENT = 'aether:discovery'

/**
 * A FAILED READ IS NOT AN EMPTY ONE, and this hook used to make them identical.
 *
 * It caught every error and left `runs` empty, so the screen said "No events in the
 * window. Nothing has run recently." whether nothing had run or the database was
 * unreachable. On 2026-09-10 a DNS wobble at Atlas took down every read in the app — 8
 * failures across setups, ideas, coverage and scans — and this list reported a quiet day.
 * It cost two rounds of looking in the wrong place before the log said otherwise.
 *
 * The error is kept and returned. It does NOT blank a list already on screen: a refetch
 * failing after a good read should say the refresh failed, not throw away the names the
 * reader is looking at.
 *
 * PUSHED, NOT POLLED. Aether writes only when an admin starts a run, and the server says so
 * over the socket the moment one lands — so the list reads once on open and again on that
 * frame. It used to sit on a five-minute timer and learn of a run up to ten minutes after
 * the button already knew, if the tick fell in a Mongo wobble. A reconnect is the one
 * moment a push may have been missed, so it re-reads then too — the same reconcile the
 * unread badge does in useChatWs.
 */
export function useAetherCandidates({ days = 30 } = {}) {
    const [runs, setRuns] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const aliveRef = useRef(true)

    const load = useCallback(async () => {
        try {
            const data = await aetherService.getCandidates({ days })
            if (!aliveRef.current) return
            setRuns(Array.isArray(data) ? data : [])
            setError('')
        } catch (err) {
            // apiError is the one reader that finds the server's own message —
            // err.message alone is axios's "Request failed with status code 500".
            if (!aliveRef.current) return
            setError(apiError(err, 'could not reach the server'))
        } finally {
            if (aliveRef.current) setLoading(false)
        }
    }, [days])

    useEffect(() => {
        aliveRef.current = true
        load()

        // Only the end of a run changes the list; the stages in between are the button's.
        function onDiscovery(status) { if (status && !status.running) load() }
        chatWsService.on(DISCOVERY_EVENT, onDiscovery)
        chatWsService.on('connected', load)
        return () => {
            aliveRef.current = false
            chatWsService.off(DISCOVERY_EVENT, onDiscovery)
            chatWsService.off('connected', load)
        }
    }, [load])

    return { runs, loading, error }
}
