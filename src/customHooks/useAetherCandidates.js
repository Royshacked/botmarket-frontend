import { useState, useEffect, useRef } from 'react'
import { aetherService } from '../services/aether/aether.service.remote.js'

// Aether writes on a schedule (a discovery run is an Opus call plus an EDGAR pass per
// name), so this polls slowly. The old shock feed polled every 60s against a generator
// that had not run since June.
const POLL_MS = 300_000

export function useAetherCandidates({ days = 30 } = {}) {
    const [runs, setRuns] = useState([])
    const [loading, setLoading] = useState(true)
    const aliveRef = useRef(true)

    useEffect(() => {
        aliveRef.current = true

        async function load() {
            try {
                const data = await aetherService.getCandidates({ days })
                if (!aliveRef.current) return
                setRuns(Array.isArray(data) ? data : [])
            } catch { /* no runs yet — stay empty rather than surfacing an error */ } finally {
                if (aliveRef.current) setLoading(false)
            }
        }

        load()
        const timer = setInterval(load, POLL_MS)
        return () => { aliveRef.current = false; clearInterval(timer) }
    }, [days])

    return { runs, loading }
}
