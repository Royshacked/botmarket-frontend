import { useState } from 'react'
import PropTypes from 'prop-types'
import { OwnedBadge } from '../OwnedBadge/OwnedBadge.jsx'
import { ChartSurface } from '../PriceChart/ChartSurface.jsx'
import { TechnicalProfile } from './TechnicalProfile.jsx'
import { useHotlistChat } from './hotlistPage.context.js'

// ONE NAME, THE WHOLE WINDOW (Roy, 2026-10-31: "when clicking a row — I want it to cover the whole chatbox like the
// detail window"). A row of any Hotlist list opens here in place of the table: the name, the row's numbers as tiles,
// its daily chart, and what the row says in words (the list's own detail, with its hand-offs). The panel's header
// carries "‹ Back to the list". The chart's Close hides the chart only — the page stays.
//
// IN BOTTOM LINES since 2026-11-21 (Roy: "very long stories — I want bottom lines and a chat button if the user wants to
// chat about it and get the full info"): each part says one line; CHAT ABOUT IT hands the name to Axl, who has the whole
// story — the coverage, how it trades, the events, the news (backend docs/design/axl-one-voice.md).

export function HotlistRowPage({ symbol, name = null, horizon = null, facts = [], children = null }) {
    const [chart, setChart] = useState(true)
    const onChat = useHotlistChat()
    return (
        <div className="hot-page" data-symbol={symbol}>
            <header className="hot-page__head">
                <span className="hot-page__sym">{symbol}</span><OwnedBadge symbol={symbol} />
                {name && <span className="hot-page__name">{name}</span>}
                {onChat && <button type="button" className="floor-queued__btn hot-page__chat" onClick={() => onChat(symbol, name)}
                    title={`Ask Axl about ${symbol} — the analyst's view, how it trades, the timing, the events and the news`}>Chat about it</button>}
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
            {/* How it trades on this row's horizon — the technical analyst's profile (proteus.md §8.1; it replaced the row badge). */}
            <TechnicalProfile symbol={symbol} horizon={horizon} />
            {chart
                ? <div className="hot-page__chart"><ChartSurface ticker={symbol} timeframe="day" onClose={() => setChart(false)} /></div>
                : <button type="button" className="cal-link hot-page__show-chart" onClick={() => setChart(true)}>Show the daily chart</button>}
            {children && <div className="hot-page__body">{children}</div>}
        </div>
    )
}
HotlistRowPage.propTypes = {
    symbol: PropTypes.string.isRequired, name: PropTypes.string,
    /** The list's horizon (intraday, week, swing, long_term, covered) — which timeframes the profile reads. */
    horizon: PropTypes.string,
    /** [label, value, className?, title?, wide?] — the class the table's cell would carry (hot-up, hot-result hot-result--good …). */
    facts: PropTypes.arrayOf(PropTypes.array), children: PropTypes.node,
}
