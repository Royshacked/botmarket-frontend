import { useState, useRef } from 'react'
import PropTypes from 'prop-types'
import { PriceChart } from './PriceChart.jsx'
import './ChartSurface.scss'

const DRAW_TOOLS = [
    { key: 'segment',                label: 'Line' },
    { key: 'horizontalStraightLine', label: 'H-Line' },
    { key: 'fibonacciLine',          label: 'Fib' },
    { key: 'rectangle',              label: 'Rect' },
]

/**
 * The app's ONE interactive chart (drawing tools, live candles) — the view half of the shared chart
 * surface (services/chartSurface.service.js). It fills whatever it's put in, so its host decides the
 * size; today that host is ChatChartDock, which pins it to the bottom of the chat the user asked for
 * it in.
 *
 * @param {string}   ticker
 * @param {string}   timeframe   any spelling PriceChart's PERIOD_MAP knows ('1hr', '15min', 'day'…)
 * @param {object[]} [drawings]  prompt-driven overlays (e.g. horizontal price lines)
 * @param {Function} onClose
 * @param {Function} [onCollapse] when given, adds a collapse control beside Close. Docked hosts pass
 *                   it so the thread can have its room back without losing the chart; a host that
 *                   owns its whole pane has nothing to collapse into and omits it.
 */
export function ChartSurface({ ticker, timeframe, drawings = [], onClose, onCollapse }) {
    const [activeTool, setActiveTool] = useState(null)
    const chartRef = useRef(null)

    function handleTool(key) {
        chartRef.current?.activateTool(key)
        setActiveTool(key)
        // brief button highlight, then reset — drawing mode is "one-shot" per click
        setTimeout(() => setActiveTool(null), 800)
    }

    return (
        <div className="chart-surface">
            <div className="chart-surface__toolbar">
                {/* The drawing tools are GROUPED, and the group is the only thing in this strip
                    allowed to run out of room. Flat siblings of Close, they made the toolbar wider
                    than a phone: 438px of buttons in a 320px dock, and since the dock clips
                    (overflow: hidden) what got cut was the LAST item — Close, entirely, on every
                    common phone width. The ✕ still reachable was this group's clear-drawings one,
                    which does nothing on a chart with no drawings, so closing simply looked broken.
                    The group scrolls instead; Close and Hide never shrink. See the stylesheet. */}
                <div className="chart-surface__tools">
                    {DRAW_TOOLS.map(t => (
                        <button
                            key={t.key}
                            className={`chart-surface__tool${activeTool === t.key ? ' chart-surface__tool--active' : ''}`}
                            onClick={() => handleTool(t.key)}
                            title={t.label}
                        >
                            {t.label}
                        </button>
                    ))}
                    <div className="chart-surface__tool-sep" />
                    <button
                        className="chart-surface__tool"
                        onClick={() => chartRef.current?.undoLastDrawing()}
                        title="Undo last drawing"
                    >
                        ↩
                    </button>
                    <button
                        className="chart-surface__tool"
                        onClick={() => chartRef.current?.clearAllDrawings()}
                        title="Clear all drawings"
                        aria-label="Clear all drawings"
                    >
                        ✕
                    </button>
                </div>

                {onCollapse && (
                    <button
                        className="chart-surface__close chart-surface__collapse"
                        onClick={onCollapse}
                        title="Collapse the chart"
                        aria-label="Collapse the chart"
                    >
                        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="3,4.5 6,7.5 9,4.5" />
                        </svg>
                        Hide
                    </button>
                )}
                <button
                    className={`chart-surface__close${onCollapse ? ' chart-surface__close--paired' : ''}`}
                    onClick={onClose}
                    title="Close the chart"
                    aria-label="Close the chart"
                >
                    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                        <line x1="3" y1="3" x2="9" y2="9" /><line x1="9" y1="3" x2="3" y2="9" />
                    </svg>
                    Close
                </button>
            </div>

            <div className="chart-surface__body">
                {/* Keyed so a NEW request for a different symbol/timeframe remounts the chart
                    rather than mutating a live KLineCharts instance mid-poll. */}
                <PriceChart
                    key={`${ticker}-${timeframe}`}
                    ref={chartRef}
                    symbol={ticker}
                    interval={timeframe}
                    drawings={drawings}
                />
            </div>
        </div>
    )
}

ChartSurface.propTypes = {
    ticker:    PropTypes.string.isRequired,
    timeframe: PropTypes.string.isRequired,
    drawings:  PropTypes.arrayOf(PropTypes.shape({
        type:   PropTypes.string,
        points: PropTypes.array,
    })),
    onClose:    PropTypes.func.isRequired,
    onCollapse: PropTypes.func,
}
