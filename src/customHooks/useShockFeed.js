import { useState, useEffect, useRef } from 'react'
import { aetherService } from '../services/aether/aether.service.remote.js'

const POLL_MS = 60_000

export function useShockFeed() {
    const [signals,       setSignals]       = useState([])
    const [opportunities, setOpportunities] = useState([])
    const [loading,       setLoading]       = useState(true)
    const aliveRef = useRef(true)

    useEffect(() => {
        aliveRef.current = true

        async function load() {
            try {
                const data = await aetherService.getShockFeed()
                if (!aliveRef.current) return
                setSignals(data?.predicted_signals ?? [])
                setOpportunities(data?.opportunities ?? [])
            } catch { /* engine has not run yet — stay empty, do not surface an error */ } finally {
                if (aliveRef.current) setLoading(false)
            }
        }

        load()
        const timer = setInterval(load, POLL_MS)
        return () => { aliveRef.current = false; clearInterval(timer) }
    }, [])

    return { signals, opportunities, loading }
}
