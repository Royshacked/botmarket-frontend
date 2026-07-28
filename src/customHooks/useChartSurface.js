import { useState, useEffect } from 'react'
import { eventBus } from '../services/event-bus.service'
import { CHART_OPEN, CHART_CLOSE, closeChart, currentChart } from '../services/chartSurface.service'

/**
 * Subscribe to the shared chart surface (services/chartSurface.service.js).
 *
 * ChatChartDock calls this and shows `chart` when it's non-null. Seeded from the service's current
 * request so a late mount — switching agent tabs, or a panel mounting mid-stream — picks up the
 * already-docked chart instead of losing it.
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
