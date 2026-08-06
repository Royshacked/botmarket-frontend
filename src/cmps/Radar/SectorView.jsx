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

function StanceRow({ row }) {
    const c = _contrib(row.contribution_bp)
    return (
        <div className={`sector-view__row sector-view__row--${row.stance ?? 'none'}`}>
            <span className="sector-view__sector">{row.sector}</span>
            <span className={`sector-view__stance sector-view__stance--${row.stance ?? 'none'}`}>
                {STANCE_LABEL[row.stance] ?? 'no view'}
            </span>
            <span className="sector-view__bp">{_bp(row.active_bp)}</span>
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
StanceRow.propTypes = { row: PropTypes.object.isRequired }

export function SectorView({ tilt = null, loading = false }) {
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
                    ? rows.map(r => <StanceRow key={r.sector} row={r} />)
                    : <p className="news-feed__empty">This view carries no stances.</p>}
            </div>
        </div>
    )
}

SectorView.propTypes = {
    tilt:    PropTypes.object,
    loading: PropTypes.bool,
}
