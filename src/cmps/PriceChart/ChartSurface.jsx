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
 * The workspace chart — the ONE place a chart is rendered for the user.
 *
 * Any agent opens it through the shared chart surface (services/chartSurface.service.js); this is
 * only the view. It fills whatever it's put in (the lists panel), so the chart gets the full pane
 * rather than a chat-width bubble — which is the whole point of moving it out of the thread.
 *
 * Replaces the old inline ChartBubble: same PriceChart, same drawing tools, minus the collapse
 * (nothing to collapse into — closing returns the panel to the lists).
 *
 * @param {string}   ticker
 * @param {string}   timeframe   any spelling PriceChart's PERIOD_MAP knows ('1hr', '15min', 'day'…)
 * @param {object[]} [drawings]  prompt-driven overlays (e.g. horizontal price lines)
 * @param {Function} onClose
 */
export function ChartSurface({ ticker, timeframe, drawings = [], onClose }) {
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
                >
                    ✕
                </button>

                <button
                    className="chart-surface__close"
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
    onClose:   PropTypes.func.isRequired,
}
