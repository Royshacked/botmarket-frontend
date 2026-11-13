import { createContext, useContext, useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { hotlistService } from '../../services/hotlist/hotlist.service.remote'

// HOW IT TRADES — the technical analyst's measured profile in an OPENED Hotlist row (backend docs/design/proteus.md §8.1
// decision 4, Roy 2026-11-13: "the technical profile should be shown when opening a row instead of a badge"). On the
// row's horizon: what holds (or, when nothing does, what it does — its false breaks and how deep they sweep), its latest
// example, ATR and fit. A name not profiled yet is measured on the spot (several seconds on a first look). The written
// read is one click away: the provider at the Hotlist panel carries the opener (handed off like Build).

const TechnicalsContext = createContext({ onAsk: null })

export function TechnicalsProvider({ onAsk = null, children }) {
    return <TechnicalsContext.Provider value={{ onAsk }}>{children}</TechnicalsContext.Provider>
}
TechnicalsProvider.propTypes = { onAsk: PropTypes.func, children: PropTypes.node }

const REASONS = {
    no_history: 'Not enough price history to measure how it trades.',
    too_short: 'Not enough history on this horizon\'s bars to say.',
    bad_symbol: 'Not a ticker the profile can read.',
}

export function TechnicalProfile({ symbol, horizon, _fetch = hotlistService.getProfile }) {
    const { onAsk } = useContext(TechnicalsContext)
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
    return (
        <section className="hot-profile" aria-label="How it trades">
            <header className="hot-profile__head">
                <h3 className="hot-profile__title">How it trades</h3>
                {status === 'ok' && <span className={`hot-profile__headline hot-profile__headline--${data.headline.kind}`}>{data.headline.text}</span>}
                {onAsk && <button type="button" className="cal-link hot-profile__ask" onClick={() => onAsk(String(symbol).toUpperCase())}>Ask the technical analyst</button>}
            </header>
            {status === 'loading' && <p className="hot-profile__note">Measuring how {symbol} trades — a first look takes several seconds.</p>}
            {status === 'error' && <p className="hot-profile__note">The profile could not be read just now.</p>}
            {status === 'none' && <p className="hot-profile__note">{REASONS[data.reason] ?? 'No profile for this name.'}</p>}
            {status === 'ok' && (
                <dl className="hot-profile__lines">
                    {data.lines.map(([label, text]) => (
                        <div key={label}><dt>{label}</dt><dd>{text}</dd></div>
                    ))}
                </dl>
            )}
            {status === 'ok' && data.computed_at && <p className="hot-profile__note">Measured {String(data.computed_at).slice(0, 10)} — counted from its own candles, against a baseline.</p>}
        </section>
    )
}
TechnicalProfile.propTypes = { symbol: PropTypes.string.isRequired, horizon: PropTypes.string, _fetch: PropTypes.func }
