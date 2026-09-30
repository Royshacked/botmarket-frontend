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
    // Up is the stance WORKING, whichever way it is pointed — the series is already signed.
    const tone = last > 100.05 ? 'up' : last < 99.95 ? 'down' : 'flat'

    return (
        <svg className={`sector-view__spark sector-view__spark--${tone}`} viewBox={`0 0 ${W} ${H}`}
            width={W} height={H} aria-hidden="true" focusable="false"
            data-stance={stance ?? 'none'} data-points={points.length}>
            <line className="sector-view__spark-base" x1={0} x2={W} y1={y(100)} y2={y(100)} />
            <polyline className="sector-view__spark-line" fill="none"
                points={vs.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} />
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
            <span className={`sector-view__stance sector-view__stance--${row.stance ?? 'none'}`}>
                {STANCE_LABEL[row.stance] ?? 'no view'}
            </span>
            <span className="sector-view__bp">{_bp(row.active_bp)}</span>
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

export function SectorView({ tilt = null, loading = false, series = {} }) {
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
}
