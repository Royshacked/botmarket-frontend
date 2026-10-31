import { useState } from 'react'
import PropTypes from 'prop-types'
import { OwnedBadge } from '../OwnedBadge/OwnedBadge.jsx'
import { ChartSurface } from '../PriceChart/ChartSurface.jsx'

// ONE NAME, THE WHOLE WINDOW (Roy, 2026-10-31: "when clicking a row — I want it to cover the whole chatbox like the
// detail window"). A row of any Hotlist list opens here in place of the table: the name, the row's numbers as tiles,
// its daily chart, and what the row says in words (the list's own detail, with its hand-offs). The panel's header
// carries "‹ Back to the list". The chart's Close hides the chart only — the page stays.

export function HotlistRowPage({ symbol, name = null, facts = [], children = null }) {
    const [chart, setChart] = useState(true)
    return (
        <div className="hot-page" data-symbol={symbol}>
            <header className="hot-page__head">
                <span className="hot-page__sym">{symbol}</span><OwnedBadge symbol={symbol} />
                {name && <span className="hot-page__name">{name}</span>}
            </header>
            {facts.length > 0 && (
                <dl className="hot-page__facts">
                    {facts.map(([label, value, cls, title, wide]) => (
                        <div key={label} className={`hot-page__fact${wide ? ' hot-page__fact--wide' : ''}`} title={title}>
                            <dt>{label}</dt>
                            <dd className={cls || undefined}>{value ?? '—'}</dd>
                        </div>
                    ))}
                </dl>
            )}
            {chart
                ? <div className="hot-page__chart"><ChartSurface ticker={symbol} timeframe="day" onClose={() => setChart(false)} /></div>
                : <button type="button" className="cal-link hot-page__show-chart" onClick={() => setChart(true)}>Show the daily chart</button>}
            {children && <div className="hot-page__body">{children}</div>}
        </div>
    )
}
HotlistRowPage.propTypes = {
    symbol: PropTypes.string.isRequired, name: PropTypes.string,
    /** [label, value, className?, title?, wide?] — the class the table's cell would carry (hot-up, hot-result hot-result--good …). */
    facts: PropTypes.arrayOf(PropTypes.array), children: PropTypes.node,
}
