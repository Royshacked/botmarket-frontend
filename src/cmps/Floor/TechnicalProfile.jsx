import { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { hotlistService } from '../../services/hotlist/hotlist.service.remote'
import { HotlistPageContext } from './hotlistPage.context.js'

// HOW IT TRADES — the house's measured profile in an OPENED Hotlist row, on the row's horizon's scale (backend
// docs/design/proteus-v2.md §5, 2026-11-21): bottom lines — how far it moves, its natural stop and target and how often the
// target came first, whether it trends or reverts. The whole profile is Axl's, in the chat (Chat about it). A name not
// profiled yet is measured on the spot (a few seconds on a first look).

// The panel's hand-offs a row's page reads (hotlistPage.context.js): `onChat` — "Chat about it".
export function TechnicalsProvider({ onChat = null, children }) {
    return <HotlistPageContext.Provider value={{ onChat }}>{children}</HotlistPageContext.Provider>
}
TechnicalsProvider.propTypes = { onChat: PropTypes.func, children: PropTypes.node }

const REASONS = {
    no_history: 'Not enough price history to measure how it trades.',
    unavailable: 'Its price history could not be fetched just now — open it again in a minute.',
    too_short: 'Not enough history on this horizon\'s bars to say.',
    bad_symbol: 'Not a ticker the profile can read.',
}

export function TechnicalProfile({ symbol, horizon, _fetch = hotlistService.getProfile }) {
    const [state, setState] = useState({ status: 'loading', data: null })
    useEffect(() => {
        let live = true
        setState({ status: 'loading', data: null })
        Promise.resolve().then(() => _fetch(symbol, horizon))
            .then(data => { if (live) setState({ status: data?.reason ? 'none' : 'ok', data }) })
            .catch(() => { if (live) setState({ status: 'error', data: null }) })
        return () => { live = false }
    }, [symbol, horizon, _fetch])
    const { status, data } = state
    const lines = status === 'ok' ? (data.lines ?? []) : []
    return (
        <section className="hot-profile" aria-label="How it trades">
            <header className="hot-profile__head">
                <h3 className="hot-profile__title">How it trades</h3>
                {status === 'ok' && data.headline && <span className={`hot-profile__headline hot-profile__headline--${data.headline.kind}`}>{data.headline.text}</span>}
            </header>
            {status === 'loading' && <p className="hot-profile__note">Measuring how {symbol} trades — a first look takes a few seconds.</p>}
            {status === 'error' && <p className="hot-profile__note">The profile could not be read just now.</p>}
            {status === 'none' && <p className="hot-profile__note">{REASONS[data.reason] ?? 'No profile for this name.'}</p>}
            {lines.length > 0 && (
                <dl className="hot-profile__lines">
                    {lines.map(([label, text]) => (
                        <div key={label} className="hot-profile__line"><dt>{label}</dt><dd>{text}</dd></div>
                    ))}
                </dl>
            )}
        </section>
    )
}
TechnicalProfile.propTypes = { symbol: PropTypes.string.isRequired, horizon: PropTypes.string, _fetch: PropTypes.func }
