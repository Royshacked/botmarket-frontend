import { useState, useEffect } from 'react'
import { useChartSurface } from '../customHooks/useChartSurface.js'
import { ChartSurface } from './PriceChart/ChartSurface.jsx'
import './ChatChartDock.scss'

/**
 * The chart a user asked for, DOCKED at the bottom of the chat — above the input row, below the
 * thread. It stays put while the conversation scrolls, because a chart you're trading off is a
 * reference you keep glancing at, not a message that slides away.
 *
 * Two controls: collapse (down to a slim ticker bar, so the thread gets its room back without
 * losing the chart) and close (gone until asked for again).
 *
 * TAKES NO PROPS ON PURPOSE. It reads the shared chart store (services/chartSurface.service.js),
 * which the `chart` stream event writes to directly (services/sse.util.js) — so a surface gets a
 * docked chart by rendering this ONE tag, with no state to own and no callback to thread down to it.
 * That is why five panels get it from AgentChatInput alone.
 *
 * ONE chart across the app, by the same store's design: a new request replaces whatever is docked,
 * and the dock follows you between agent chats rather than each chat keeping its own.
 */
export function ChatChartDock() {
    const { chart, close } = useChartSurface()
    const [collapsed, setCollapsed] = useState(false)

    // A new request re-expands a collapsed dock: asking to see a chart means you want to see it.
    // Keyed on `at` too, so re-asking for the SAME view (which the store stamps afresh) also counts.
    useEffect(() => { setCollapsed(false) }, [chart?.ticker, chart?.timeframe, chart?.at])

    if (!chart) return null

    const label = `${chart.ticker} · ${String(chart.timeframe ?? 'day').toUpperCase()}`

    if (collapsed) {
        return (
            <div className="chat-chart-dock chat-chart-dock--collapsed">
                <button
                    type="button"
                    className="chat-chart-dock__restore"
                    onClick={() => setCollapsed(false)}
                    title="Show the chart"
                >
                    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="3,7.5 6,4.5 9,7.5" />
                    </svg>
                    <span className="chat-chart-dock__label">{label}</span>
                </button>
                <button
                    type="button"
                    className="chat-chart-dock__btn"
                    onClick={close}
                    title="Close the chart"
                    aria-label="Close the chart"
                >
                    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                        <line x1="3" y1="3" x2="9" y2="9" /><line x1="9" y1="3" x2="3" y2="9" />
                    </svg>
                </button>
            </div>
        )
    }

    return (
        <div className="chat-chart-dock">
            {/* The workspace chart component, reused whole — its toolbar already carries the drawing
                tools and Close; collapse is the one control a docked chart adds. */}
            <ChartSurface
                ticker={chart.ticker}
                timeframe={chart.timeframe}
                drawings={chart.drawings ?? []}
                onClose={close}
                onCollapse={() => setCollapsed(true)}
            />
        </div>
    )
}
