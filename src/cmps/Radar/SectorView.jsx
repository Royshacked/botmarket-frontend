import PropTypes from 'prop-types'
import './SectorView.scss'

// Pythia's house view — the regime, and the sector stances it implies as ACTIVE WEIGHT against the
// benchmark. A stance is a claim that the sector BEATS the index, not that it rises, so everything
// here reads relative: an underweight that fell less than the market earned its keep.
//
// The Radar's FORECASTS tab, beside Fed / Earnings / IPO. Those tabs are schedules — things that
// will happen on a date. This one is a STATE: what we currently think, and how it is doing. The dated
// half (next review, each stance's grading date, the macro prints that could force an early
// re-author) belongs on the Fed tab beside the other events.

const STANCE_LABEL = { over: 'overweight', neutral: 'neutral', under: 'underweight' }

// Plain names for the engine's channel ids (aether-engine configs/channels.yaml). A channel added
// later without a name here still reads, as its id with the underscores dropped.
const CHANNEL_LABEL = {
    discount_rate: 'Real yields', policy_rate_expectations: 'Policy-rate expectations', yield_curve: 'Yield curve',
    inflation_expectations: 'Inflation expectations', energy_cost: 'Energy costs', risk_premium: 'Risk premium (VIX)',
    fx_usd: 'Dollar', credit_access: 'IG credit spreads', high_yield_spread: 'High-yield spreads', liquidity: 'Fed liquidity',
    freight_logistics: 'Freight costs', consumer_credit: 'Consumer credit', supply_chain_concentration: 'Supply-chain pressure',
    corporate_capex: 'Business capex', regulatory_policy: 'Policy uncertainty', input_scarcity: 'Input costs',
    end_demand: 'End demand', labor_cost: 'Labour costs', commodity_metals: 'Industrial metals',
    commodity_agriculture: 'Farm commodities', housing_construction: 'Housing', fiscal_impulse: 'Fiscal impulse',
    demographic_labor: 'Labour supply',
}
const _channel = (id) => CHANNEL_LABEL[id] ?? String(id ?? '').replace(/_/g, ' ')
const _z = (v) => (v === null || v === undefined ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}z`)

/**
 * THE MACRO CALLS behind the sized rows — what the desk forecast, against what history says, and how
 * each call is doing. Only the DEPARTURE from history is sized (history is priced), so that number
 * is the one the row weights follow. A mark is a RESULT, so it alone takes colour: ahead of history
 * green, behind it red.
 */
function ChannelCalls({ views, marks, record }) {
    if (!Array.isArray(views) || !views.length) return null
    // Below ten final grades the weight is still the PLACEHOLDER, not something the record earned —
    // "3 graded, 33%, weighted at 0.4" would read as if 0.4 came from the 33%. `measured` is the
    // server's word for that; an older payload without it falls back to the same count.
    const measured = record?.measured ?? (record?.graded >= 10)
    const recordLine = !record
        ? null
        : record.graded
            ? `Record: ${record.beat} of ${record.graded} calls beat history (${Math.round((record.hit_rate ?? 0) * 100)}%) — `
                + (measured ? `calls weighted at ${record.confidence}.` : `calls still weighted at ${record.confidence} until ten are graded.`)
            : `No call graded yet — each is graded at six months; calls weighted at ${record.confidence} until ten are.`
    return (
        <div className="sector-view__calls">
            <span className="sector-view__kills-label">channel calls</span>
            {views.map(v => {
                const m = marks?.[v.channel_id]?.latest_mark ?? null
                return (
                    <div key={v.channel_id} className="sector-view__call">
                        <span className="sector-view__call-name">{_channel(v.channel_id)}</span>
                        <span className="sector-view__call-nums" title="The desk's call, history's usual move from here (priced), and the departure the rows are sized on">
                            called {_z(v.dz)} · history {_z(v.base_dz)} · <b>departs {_z(v.deviation)}</b>
                        </span>
                        <span className="sector-view__call-made">{_date(v.set_at) ?? ''}</span>
                        <span className={`sector-view__call-mark sector-view__call-mark--${m ? (m.beat_base ? 'ahead' : 'behind') : 'none'}`}
                            title={m ? `At ${m.weeks} weeks: moved ${_z(m.actual_dz)} — the call expected ${_z(m.expected_dz)}, history ${_z(m.base_expected_dz)}` : 'First mark at four weeks'}>
                            {m ? `${m.weeks}w ${m.beat_base ? 'ahead' : 'behind'}` : 'no mark yet'}
                        </span>
                        {v.rationale && <p className="sector-view__why">{v.rationale}</p>}
                    </div>
                )
            })}
            {recordLine && <p className="sector-view__record">{recordLine}</p>}
        </div>
    )
}
ChannelCalls.propTypes = { views: PropTypes.array, marks: PropTypes.object, record: PropTypes.object }

/** +150bp / -50bp / — . An absent weight is not a zero. */
function _bp(v) {
    if (v === null || v === undefined) return '—'
    return `${v >= 0 ? '+' : ''}${v}bp`
}

/**
 * Contribution reads in basis points of portfolio return, and NULL IS NOT ZERO — an unpriced stance
 * shows a dash. Rendering "0.0bp" for a sector we could not price would claim the call earned
 * nothing when the truth is that nobody knows yet.
 */
function _contrib(v) {
    if (v === null || v === undefined) return { text: '—', tone: 'unknown' }
    return { text: `${v >= 0 ? '+' : ''}${v.toFixed(1)}bp`, tone: v > 0 ? 'up' : v < 0 ? 'down' : 'flat' }
}

function _date(iso) {
    if (!iso) return null
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })
}

/**
 * The stance's own line — its performance against the benchmark since the day the call was made,
 * rebased to 100. Inline SVG, no library: it is forty points in a table cell.
 *
 * WHY A LINE AT ALL. `contribution_bp` says where a stance ended up and nothing about how it got
 * there, and those are different facts about a call. A stance that bled for five months and
 * snapped back last week reads identically to one that worked from the day it was set, and only
 * one of them is a thesis behaving as written.
 *
 * The 100 line is drawn because it is the only value that means anything: above it the bucket is
 * beating the benchmark, below it is not. Without it a rising line could be either.
 */
function Spark({ points, stance, activeBp }) {
    if (!Array.isArray(points) || points.length < 2) return null

    const W = 64, H = 18, PAD = 1
    // SIGNED BY THE STANCE, and this is the whole point of the chart. The server sends the BUCKET's
    // relative return — an objective fact, and the same quantity the grader scores. What the row's
    // number reports is what the STANCE earned, which is that return times the sign of the weight.
    // Plot the bucket's line unsigned and every underweight reads backwards: Real Estate showed
    // +7.9bp beside a falling red line, because the sector fell and the desk was short it.
    const sign = (activeBp ?? 0) < 0 ? -1 : 1
    const vs   = points.map(p => 100 + (p.v - 100) * sign)
    // The baseline is always inside the frame, so "above or below 100" is readable without axes.
    const lo   = Math.min(...vs, 100)
    const hi   = Math.max(...vs, 100)
    const span = (hi - lo) || 1
    const x = i => PAD + (i / (points.length - 1)) * (W - 2 * PAD)
    const y = v => PAD + (1 - (v - lo) / span) * (H - 2 * PAD)

    const last = vs[vs.length - 1]
    // CONTEXT VS CALL. Points the server marks `pre` are where the bucket was coming from before the
    // call — drawn lighter. The call starts at the first point after them; the tick marks it.
    const split = points.findIndex(p => !p.pre)
    const callIdx = split === -1 ? points.length - 1 : Math.max(0, split - 1)   // the last pre point joins the two
    const hasCall = split !== -1
    // COLOURED BY DIRECTION, like the weight beside it (Roy, 2026-10-01): green for an overweight,
    // red for an underweight, the whole line. The RESULT is read from the shape — the series is
    // signed, so up is the stance working whichever way it points — and from the number to its right.
    const tone = stance === 'over' ? 'over' : stance === 'under' ? 'under' : 'none'
    const pts = (from, to) => vs.slice(from, to + 1).map((v, i) => `${x(from + i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')

    return (
        <svg className={`sector-view__spark sector-view__spark--${tone}`} viewBox={`0 0 ${W} ${H}`}
            width={W} height={H} aria-hidden="true" focusable="false"
            data-stance={stance ?? 'none'} data-points={points.length} data-context={hasCall ? callIdx : points.length}>
            <line className="sector-view__spark-base" x1={0} x2={W} y1={y(100)} y2={y(100)} />
            {callIdx > 0 && (
                <polyline className="sector-view__spark-line sector-view__spark-line--pre" fill="none" points={pts(0, callIdx)} />
            )}
            {hasCall && (
                <polyline className="sector-view__spark-line" fill="none" points={pts(callIdx, points.length - 1)} />
            )}
            {callIdx > 0 && <line className="sector-view__spark-call" x1={x(callIdx)} x2={x(callIdx)} y1={0} y2={H} />}
            <circle className="sector-view__spark-dot" cx={x(points.length - 1)} cy={y(last)} r={1.6} />
        </svg>
    )
}
Spark.propTypes = { points: PropTypes.array, stance: PropTypes.string, activeBp: PropTypes.number }

/**
 * What the row is graded against, and what is imperfect about it. The server records `weighting`
 * and `exact` on every proxy precisely because both distort a grade, so the board has to be able
 * to say so rather than printing a ticker as if it were the bucket itself.
 */
function _proxyTitle(proxy) {
    const notes = []
    if (proxy?.weighting === 'equal') notes.push('equal-weighted against a cap-weighted benchmark, so part of a size factor rides along')
    if (proxy?.exact === false)       notes.push('the fund spans more than this bucket')
    return `Graded against ${proxy?.symbol}${notes.length ? ` — ${notes.join('; ')}` : ''}`
}

function StanceRow({ row, points }) {
    const c = _contrib(row.contribution_bp)
    return (
        <div className={`sector-view__row sector-view__row--${row.stance ?? 'none'}`}>
            {/* A stance is held on a SECTOR or an INDUSTRY. The grain shows only on the finer one:
                a sector is the default, and tagging every row would hide the exception. The fund
                the row is graded against carries its own caveats — see _proxyTitle. */}
            <span className="sector-view__bucket" title={row.bucket}>
                {row.bucket}
                {row.grain === 'industry' && <i className="sector-view__grain">ind</i>}
                {row.proxy?.symbol && (
                    <i className="sector-view__proxy" title={_proxyTitle(row.proxy)}>
                        {row.proxy.symbol}{(row.proxy.exact === false || row.proxy.weighting === 'equal') ? '*' : ''}
                    </i>
                )}
            </span>
            {/* The weight carries the direction by its COLOUR — green over, red under — rather than
                an "overweight" word beside it: the sign already says it, and the word was a second
                column restating the first. The word stays as the title and the accessible name, so
                the meaning is never colour alone. */}
            <span className={`sector-view__bp sector-view__bp--${row.stance ?? 'none'}`}
                title={STANCE_LABEL[row.stance] ?? 'no view'}
                aria-label={`${STANCE_LABEL[row.stance] ?? 'no view'} ${_bp(row.active_bp)}`}>
                {_bp(row.active_bp)}
            </span>
            {/* The line sits immediately before the number it explains — same fact, one as a shape
                and one as a figure. It renders nothing at all when there are no bars yet (a call
                made today), rather than an empty box that reads like a broken chart. */}
            <Spark points={points} stance={row.stance} activeBp={row.active_bp} />
            <span className={`sector-view__contrib sector-view__contrib--${c.tone}`} title="Contribution to date: active weight x relative return">
                {c.text}
            </span>
            {/* The horizon is when this stance gets GRADED. Per row, because reaffirming a stance
                keeps its original clock — a monthly review that changes two sectors must not reset
                the nine it restated. */}
            <span className="sector-view__horizon" title={row.review_date ? `Graded ${_date(row.review_date)}` : 'No grading date'}>
                {row.horizon ?? '—'}
                {row.state === 'matured' && <span className="sector-view__matured" title="Window closed — graded">✓</span>}
            </span>
            {row.rationale && <p className="sector-view__why">{row.rationale}</p>}
        </div>
    )
}
StanceRow.propTypes = { row: PropTypes.object.isRequired, points: PropTypes.array }

export function SectorView({ tilt = null, loading = false, series = {}, calls = null }) {
    if (loading) return <div className="news-feed__loader"><span /><span /><span /></div>
    if (!tilt) {
        return <p className="news-feed__empty">No house view published yet. Ask Pythia for a top-down read.</p>
    }

    const rows   = Array.isArray(tilt.tilts) ? tilt.tilts : []
    const total  = _contrib(tilt.monitor?.total_bp)
    const kills  = tilt.regime?.kill_criteria ?? []
    const asOf   = _date(tilt.created_at)

    return (
        <div className="sector-view">
            {tilt.regime && (
                <div className="sector-view__regime">
                    <div className="sector-view__regime-head">
                        <span className="sector-view__regime-name">{tilt.regime.name ?? 'Regime'}</span>
                        {asOf && <span className="sector-view__asof">published {asOf}</span>}
                    </div>
                    {tilt.regime.thesis && <p className="sector-view__thesis">{tilt.regime.thesis}</p>}
                    {kills.length > 0 && (
                        <div className="sector-view__kills">
                            {/* What would make this read WRONG. Without these the regime is a mood,
                                and the monitor has nothing it can act on. */}
                            <span className="sector-view__kills-label">what breaks it</span>
                            <ul>{kills.map((k, i) => <li key={i}>{k}</li>)}</ul>
                        </div>
                    )}
                </div>
            )}

            <ChannelCalls views={tilt.channel_views} marks={calls?.calls} record={calls?.record} />

            <div className="sector-view__summary">
                <span className="sector-view__bench">vs {tilt.benchmark ?? 'SPX'}</span>
                <span className={`sector-view__total sector-view__total--${total.tone}`} title="Total contribution across graded stances">
                    {total.text}
                </span>
                {/* An unbalanced table is published rather than lost, so the surface has to admit it:
                    active weights that do not net out are not directly allocatable. */}
                {tilt.balanced === false && (
                    <span className="sector-view__warn" title={`Active weights net to ${tilt.net_bp}bp instead of 0`}>
                        unbalanced {_bp(tilt.net_bp)}
                    </span>
                )}
            </div>

            <div className="sector-view__rows">
                {rows.length
                    ? rows.map(r => <StanceRow key={r.bucket} row={r} points={series?.[r.bucket]} />)
                    : <p className="news-feed__empty">This view carries no stances.</p>}
            </div>
        </div>
    )
}

SectorView.propTypes = {
    tilt:    PropTypes.object,
    loading: PropTypes.bool,
    // Keyed by bucket. Absent is the normal state for a moment after the view lands, and forever
    // for a stance set today — the board is correct either way.
    series:  PropTypes.object,
    // `{ record, calls: { [channel_id]: { latest_mark } } }` from the call ledger. Absent until the
    // read lands; the calls themselves come from the view, so the block paints without it.
    calls:   PropTypes.object,
}
