import { useState } from 'react'
import PropTypes from 'prop-types'
import { PriceChart } from './PriceChart.jsx'
import './ChartBubble.scss'

// Collapsible chart bubble rendered inline in a chat thread.
// Shared by all agents that emit <chart>{"ticker","timeframe"}</chart>.
export function ChartBubble({ ticker, timeframe }) {
    const [collapsed, setCollapsed] = useState(false)

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
                <div className="chart-bubble__body">
                    <PriceChart symbol={ticker} interval={timeframe} />
                </div>
            )}
        </div>
    )
}

ChartBubble.propTypes = {
    ticker:    PropTypes.string.isRequired,
    timeframe: PropTypes.string.isRequired,
}
