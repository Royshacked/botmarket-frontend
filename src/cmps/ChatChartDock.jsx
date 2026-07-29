import { useState, useEffect, useRef, useCallback } from 'react'
import { useChartSurface } from '../customHooks/useChartSurface.js'
import { ChartSurface } from './PriceChart/ChartSurface.jsx'
import './ChatChartDock.scss'

// How long the panel takes to fold away, in sync with the --folding animation in the stylesheet.
// The CHART itself goes the instant you collapse — hiding it stops its polling, which is half the
// point of the control — so what plays out is the empty frame shrinking toward the corner the chip
// lands in. That keeps the DOM honest (no chart mounted behind a hidden panel) while still giving
// the eye something to follow between the two shapes.
const FOLD_MS = 220

/**
 * The chart a user asked for, DOCKED at the bottom of the chat — above the input row, below the
 * thread. It stays put while the conversation scrolls, because a chart you're trading off is a
 * reference you keep glancing at, not a message that slides away.
 *
 * Two controls: collapse (down to a chip parked in the screen's bottom-left corner, so the thread
 * gets its room back without losing the chart) and close (gone until asked for again).
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
    // The frame left behind mid-fold. It is state rather than a CSS class on the chip because the
    // element that animates OUT is not the element that animates IN — React unmounts the panel the
    // moment you collapse, and an unmounted node cannot play an exit.
    const [folding, setFolding] = useState(false)
    const foldTimer = useRef(null)

    // Stable (no deps — the setters are, and the timer lives in a ref), so the re-expand effect
    // below can depend on it without re-running on every render.
    const expand = useCallback(() => {
        clearTimeout(foldTimer.current)
        foldTimer.current = null
        setFolding(false)
        setCollapsed(false)
    }, [])

    useEffect(() => () => clearTimeout(foldTimer.current), [])

    // A request for a DIFFERENT view re-expands a collapsed dock: asking to see a chart means you
    // want to see it. Keyed on identity rather than the store's `at` stamp, so a request for exactly
    // what is already docked leaves the dock as the user left it — models do re-emit the chart tag
    // while answering something else, and having the chart pop back open every time would be worse
    // than the stray request itself. Closing empties the key, so re-asking after a Close still opens.
    const chartKey = chart ? `${chart.ticker}|${chart.timeframe}` : null
    useEffect(() => { if (chartKey) expand() }, [chartKey, expand])

    // The chip appears at once — it is where the chart now lives, and a control you have to wait for
    // is a control that feels broken. The frame it left behind folds away underneath it.
    function collapse() {
        setCollapsed(true)
        setFolding(true)
        clearTimeout(foldTimer.current)
        foldTimer.current = setTimeout(() => { foldTimer.current = null; setFolding(false) }, FOLD_MS)
    }

    // Closing mid-fold would otherwise leave a pending timer and a collapsed flag behind for the
    // next chart to inherit.
    function handleClose() {
        expand()
        close()
    }

    if (!chart) return null

    const label = `${chart.ticker} · ${String(chart.timeframe ?? 'day').toUpperCase()}`

    if (collapsed) {
        return (
            <>
                {/* Empty and aria-hidden: the chart is already gone, this is only the shape of where
                    it was, shrinking toward the chip. */}
                {folding && <div className="chat-chart-dock chat-chart-dock--folding" aria-hidden="true" />}
                {/* A zero-height line where the dock was — the chip hangs off it, so "bottom-left"
                    means the bottom-left of the conversation, just above the prompt, without the
                    chip costing the thread a single pixel. */}
                <div className="chat-chart-dock__slot">
                    <div className="chat-chart-dock chat-chart-dock--collapsed">
                        <button
                            type="button"
                            className="chat-chart-dock__restore"
                            onClick={expand}
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
                            onClick={handleClose}
                            title="Close the chart"
                            aria-label="Close the chart"
                        >
                            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                                <line x1="3" y1="3" x2="9" y2="9" /><line x1="9" y1="3" x2="3" y2="9" />
                            </svg>
                        </button>
                    </div>
                </div>
            </>
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
                onClose={handleClose}
                onCollapse={collapse}
            />
        </div>
    )
}
