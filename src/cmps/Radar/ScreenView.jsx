import { useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { BUCKET_HEADING, TRADE_LABEL, HORIZON_LABEL, regimeLine, keyReason, groupByBucket, changesSince } from './screenWords.js'

// Pythia's weekly screen — "Trade now" on the Forecasts tab (backend docs/design/industry-screener.md).
// Every GICS sub-industry with the house verdict: trade it or not, and on which horizon. The verdict is
// the backend's, computed from the engine's measured scores plus Pythia's dated-catalyst score; this
// view only shows it, with the numbers behind it a click away.

const pct = (v, d = 0) => (typeof v === 'number' ? `${(v * 100).toFixed(d)}%` : '—')
const QUALITY = [['q1', 'Returns'], ['q2', 'Margins'], ['q3', 'Growth'], ['q4', 'Moat'], ['q5', 'Cycle']]
const TIMING = [['q6', 'Strength'], ['q7', 'Trend'], ['q8', 'Breadth'], ['q9', 'Extension'], ['q10', 'Range']]

function ScreenRow({ row }) {
    const [open, setOpen] = useState(false)
    const q = row.quality_detail ?? {}
    const s = row.scores ?? {}
    const via = row.basket_name && row.basket_name !== row.name ? row.basket_name : null
    return (
        <div className={`industry-view__row${open ? ' industry-view__row--open' : ''}`}>
            <button type="button" className="industry-view__line" onClick={() => setOpen(o => !o)} aria-expanded={open}>
                <span className="industry-view__head">
                    <span className="industry-view__name" title={row.name}>
                        {row.name}
                        {row.changed && <i className="screen-view__new" title={`Was: ${BUCKET_HEADING[row.previous_bucket] ?? 'not on the board'}`}>changed</i>}
                    </span>
                    <span className="industry-view__conclusion">{keyReason(row)}</span>
                </span>
                {row.trade && (
                    <span className="screen-view__chips">
                        <span className={`screen-view__trade screen-view__trade--${row.trade}`}>{TRADE_LABEL[row.trade]}</span>
                        {row.horizon && <span className="screen-view__horizon">{HORIZON_LABEL[row.horizon]}</span>}
                    </span>
                )}
            </button>
            {open && (
                <div className="industry-view__detail">
                    {row.notes && <p className="industry-view__summary">{row.notes}</p>}
                    {row.main_risk && <p><span className="industry-view__label">main risk</span> {row.main_risk}</p>}
                    <p>
                        <span className="industry-view__label">catalyst</span>{' '}
                        {row.q11 == null ? row.q11_reason
                            : row.q11 === 2 ? `${row.event_date}: ${row.mechanism}`
                                : row.q11_reason}
                        {row.q11_corrected && <i className="screen-view__corrected"> (claimed {row.q11_claimed}, marked down: {row.q11_corrected})</i>}
                    </p>
                    <div className="screen-view__scores">
                        <span className="industry-view__label">quality {row.quality}/10</span>
                        {QUALITY.map(([k, label]) => (
                            <span key={k} className="screen-view__score" title={q[`${k}_reason`] ?? ''}>{label} <b>{q[k] ?? '—'}</b></span>
                        ))}
                    </div>
                    <div className="screen-view__scores">
                        <span className="industry-view__label">timing {row.timing}/12</span>
                        {TIMING.map(([k, label]) => <span key={k} className="screen-view__score">{label} <b>{s[k] ?? '—'}</b></span>)}
                        <span className="screen-view__score">Catalyst <b>{row.q11 ?? '—'}</b></span>
                        {s.q12 && <span className="screen-view__score">Volume <b>{s.q12}</b></span>}
                    </div>
                    {(row.leaders?.length ?? 0) > 0 && (
                        <p>
                            <span className="industry-view__label">leaders</span>{' '}
                            {row.leaders.map(l => `${l.symbol} (${pct(l.ret_6_1)} 6-1, ${pct(l.from_high)} from high)`).join(' · ')}
                        </p>
                    )}
                    {via && <p className="industry-view__meta">Too few companies to measure on its own — the numbers are {via}&apos;s.</p>}
                    {Object.keys(row.na ?? {}).length > 0 && (
                        <p className="industry-view__meta">Not measured: {Object.values(row.na).join('; ')}.</p>
                    )}
                </div>
            )}
        </div>
    )
}
ScreenRow.propTypes = { row: PropTypes.object.isRequired }

export function ScreenView({ screen, query = '' }) {
    const rows = useMemo(() => {
        const qq = query.trim().toLowerCase()
        return (screen?.rows ?? []).filter(r => !qq || `${r.name} ${r.sector}`.toLowerCase().includes(qq))
    }, [screen, query])

    if (!screen) {
        return <p className="news-feed__empty">No weekly screen yet — it is published after the engine&apos;s weekly run.</p>
    }
    const reg = regimeLine(screen.regime)
    const { count, since } = changesSince(screen)
    const groups = groupByBucket(rows)

    return (
        <div className="screen-view">
            {reg && (
                <p className={`screen-view__regime screen-view__regime--${reg.regime}`}>
                    <b>Market {reg.word}</b> · {reg.text}
                </p>
            )}
            <div className="industry-view__summary-bar">
                <span>Week of <b>{screen.asof}</b></span>
                {since && <span>{count} changed since {since}</span>}
                <span className="industry-view__legend">where to look — check each company&apos;s catalyst and chart</span>
            </div>
            {groups.map(([bucket, list]) => (
                <section key={bucket ?? 'unscored'} className="industry-view__sector">
                    <h4 className={`industry-view__sector-name screen-view__bucket screen-view__bucket--${bucket ?? 'none'}`}>
                        {bucket ? BUCKET_HEADING[bucket] : 'Not scored this week'} <span>{list.length}</span>
                    </h4>
                    {list.map(r => <ScreenRow key={r.code} row={r} />)}
                </section>
            ))}
            {!groups.length && <p className="news-feed__empty">No industry matches “{query}”.</p>}
            <p className="industry-view__meta screen-view__gaps">
                Not on our data yet: sentiment and put/call (Q13), institutional flows (Q14); volatility is the S&amp;P 500&apos;s own, not the VIX.
            </p>
        </div>
    )
}

ScreenView.propTypes = { screen: PropTypes.object, query: PropTypes.string }
