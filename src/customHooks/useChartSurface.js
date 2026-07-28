import { useState, useEffect } from 'react'
import { eventBus } from '../services/event-bus.service'
import { CHART_OPEN, CHART_CLOSE, closeChart, currentChart } from '../services/chartSurface.service'

/**
 * Subscribe to the shared chart surface (services/chartSurface.service.js).
 *
 * Whoever renders the workspace lists panel calls this and shows `chart` when it's non-null.
 * Seeded from the service's current request so a late mount (panel switch mid-stream) doesn't
 * miss an already-opened chart.
 *
 * @returns {{ chart: object|null, close: () => void }}
 */
export function useChartSurface() {
    const [chart, setChart] = useState(() => currentChart())

    useEffect(() => {
        const offOpen  = eventBus.on(CHART_OPEN,  (req) => setChart(req))
        const offClose = eventBus.on(CHART_CLOSE, ()    => setChart(null))
        return () => { offOpen(); offClose() }
    }, [])

    return { chart, close: closeChart }
}
