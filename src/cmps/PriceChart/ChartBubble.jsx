import { useState, useRef } from 'react'
import PropTypes from 'prop-types'
import { PriceChart } from './PriceChart.jsx'
import './ChartBubble.scss'

const DRAW_TOOLS = [
    { key: 'segment',                label: 'Line' },
    { key: 'horizontalStraightLine', label: 'H-Line' },
    { key: 'fibonacciLine',          label: 'Fib' },
    { key: 'rectangle',              label: 'Rect' },
]

// Collapsible chart bubble rendered inline in a chat thread.
// Shared by all agents that emit <chart>{"ticker","timeframe"}</chart>.
// `drawings` carries prompt-driven overlay instructions from Axl (e.g. horizontal price lines).
export function ChartBubble({ ticker, timeframe, drawings = [] }) {
    const [collapsed,  setCollapsed]  = useState(false)
    const [activeTool, setActiveTool] = useState(null)
    const chartRef = useRef(null)

    function handleTool(key) {
        chartRef.current?.activateTool(key)
        setActiveTool(key)
        // brief button highlight, then reset — drawing mode is "one-shot" per click
        setTimeout(() => setActiveTool(null), 800)
    }

    return (
        <div className={`chart-bubble${collapsed ? ' chart-bubble--collapsed' : ''}`}>
            <button
                className="chart-bubble__header"
                onClick={() => setCollapsed(c => !c)}
                aria-expanded={!collapsed}
            >
                <span className="chart-bubble__title">
                    <span className="chart-bubble__ticker">{ticker}</span>
                    <span className="chart-bubble__tf">{timeframe.toUpperCase()}</span>
                </span>
                <span className="chart-bubble__caret" aria-hidden="true">
                    {collapsed ? '▸' : '▾'}
                </span>
            </button>
            {!collapsed && (
                <>
                    <div className="chart-bubble__toolbar">
                        {DRAW_TOOLS.map(t => (
                            <button
                                key={t.key}
                                className={`chart-bubble__tool${activeTool === t.key ? ' chart-bubble__tool--active' : ''}`}
                                onClick={() => handleTool(t.key)}
                                title={t.label}
                            >
                                {t.label}
                            </button>
                        ))}
                        <div className="chart-bubble__tool-sep" />
                        <button
                            className="chart-bubble__tool"
                            onClick={() => chartRef.current?.undoLastDrawing()}
                            title="Undo last drawing"
                        >
                            ↩
                        </button>
                        <button
                            className="chart-bubble__tool"
                            onClick={() => chartRef.current?.clearAllDrawings()}
                            title="Clear all drawings"
                        >
                            ✕
                        </button>
                    </div>
                    <div className="chart-bubble__body">
                        <PriceChart ref={chartRef} symbol={ticker} interval={timeframe} drawings={drawings} />
                    </div>
                </>
            )}
        </div>
    )
}

ChartBubble.propTypes = {
    ticker:    PropTypes.string.isRequired,
    timeframe: PropTypes.string.isRequired,
    drawings:  PropTypes.arrayOf(PropTypes.shape({
        type:   PropTypes.string,
        points: PropTypes.array,
    })),
}
