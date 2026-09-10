import { useState, useEffect, useRef } from 'react'
import { aetherService } from '../services/aether/aether.service.remote.js'
import { apiError } from '../services/http.service.js'

// Aether writes only when an admin starts a run (an Opus call plus an EDGAR pass per
// name), so this polls slowly. The old shock feed polled every 60s against a generator
// that had not run since June.
const POLL_MS = 300_000

/**
 * A FAILED READ IS NOT AN EMPTY ONE, and this hook used to make them identical.
 *
 * It caught every error and left `runs` empty, so the screen said "No events in the
 * window. Nothing has run recently." whether nothing had run or the database was
 * unreachable. On 2026-09-10 a DNS wobble at Atlas took down every read in the app — 8
 * failures across setups, ideas, coverage and scans — and this list reported a quiet day.
 * It cost two rounds of looking in the wrong place before the log said otherwise.
 *
 * The error is kept and returned. It does NOT blank a list already on screen: a poll
 * failing five minutes after a good read should say the refresh failed, not throw away the
 * names the reader is looking at.
 */
export function useAetherCandidates({ days = 30 } = {}) {
    const [runs, setRuns] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const aliveRef = useRef(true)

    useEffect(() => {
        aliveRef.current = true

        async function load() {
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
        }

        load()
        const timer = setInterval(load, POLL_MS)
        return () => { aliveRef.current = false; clearInterval(timer) }
    }, [days])

    return { runs, loading, error }
}
