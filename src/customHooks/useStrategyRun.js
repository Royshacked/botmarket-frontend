import { useEffect, useState } from 'react'
import { strategyService, INDUSTRIES_CHANGED } from '../services/strategy/strategy.service.remote.js'

/**
 * Is Pythia's long admin run `key` (`industry:<code>`, `theme:<id>`, `propose_themes`) in flight from this
 * page? The answer lives in the service, so a button remounted mid-run still shows it; this hook re-reads it
 * whenever the service announces (every run announces when it ends), so the button lets go when the run
 * lands even if the board's own refresh then fails (code review 2026-10-11).
 */
export function useStrategyRun(key) {
    const [, setTick] = useState(0)
    useEffect(() => {
        const on = () => setTick(t => t + 1)
        window.addEventListener(INDUSTRIES_CHANGED, on)
        return () => window.removeEventListener(INDUSTRIES_CHANGED, on)
    }, [])
    return key ? strategyService.isRunning(key) : false
}
