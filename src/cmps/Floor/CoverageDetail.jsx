import PropTypes from 'prop-types'
import { nextRevision, NEXT_REVISION_HINT } from '../Radar/coverage.utils.js'
import { PriceTarget } from '../PriceTarget/PriceTarget.jsx'

// One Prometheus thesis as a page of reading — the body the Floor's "Analyst companies" desk opened in the detail
// panel, kept when that desk was folded into the Forecasts map (Roy, 2026-10-14): a covered company is now reached
// through its industry, and this is what opens. The chips (rating, target, status) are separate so a panel can put
// them in its header.

const RATING_LABEL = { strong_buy: 'strong buy', buy: 'buy', hold: 'hold', sell: 'sell', strong_sell: 'strong sell' }

const asList = (v) => (Array.isArray(v) ? v : [])
// Catalysts arrive as { date, note } or as a bare string, depending on how the thesis was written.
const catalystText = (k) => (typeof k === 'string' ? k : `${k?.date ? `${k.date}: ` : ''}${k?.note ?? ''}`)
const killText     = (k) => (typeof k === 'string' ? k : JSON.stringify(k))

export function CoverageRating({ coverage: c }) {
    if (!c?.rating) return null
    return <span className={`floor-row__rating floor-row__rating--${c.rating}`}>{RATING_LABEL[c.rating] ?? c.rating}</span>
}
CoverageRating.propTypes = { coverage: PropTypes.object }

/** Rating, target and status — the facts a thesis is opened from. */
export function CoverageMeta({ coverage: c }) {
    return (
        <>
            <CoverageRating coverage={c} />
            <PriceTarget priceTarget={c.price_target} gap={c.gap} />
            {c.status && <span className={`floor-row__status floor-row__status--${c.status}`}>{c.status}</span>}
        </>
    )
}
CoverageMeta.propTypes = { coverage: PropTypes.object.isRequired }

export function CoverageDetail({ coverage: c }) {
    const kills = asList(c.kill_criteria)
    const cats  = asList(c.catalysts)
    const revs  = asList(c.revisions)
    const next  = nextRevision(c)
    return (
        <div className="floor-detail">
            {c.thesis ? <p className="floor-detail__prose">{c.thesis}</p> : <p className="floor-detail__prose">No thesis written yet.</p>}
            {kills.length > 0 && (
                <div className="floor-detail__block">
                    <span className="floor-detail__label">kill-criteria</span>
                    <ul>{kills.map((k, i) => <li key={i}>{killText(k)}</li>)}</ul>
                </div>
            )}
            {cats.length > 0 && (
                <div className="floor-detail__block">
                    <span className="floor-detail__label">catalysts</span>
                    <ul>{cats.map((k, i) => <li key={i}>{catalystText(k)}</li>)}</ul>
                </div>
            )}
            {(revs.length > 0 || next) && (
                <div className="floor-detail__foot">
                    {revs.length > 0 && (
                        <span className="floor-detail__revs">{revs.length} revision{revs.length > 1 ? 's' : ''}</span>
                    )}
                    {next && (
                        <span className={`floor-detail__next${next.due ? ' floor-detail__next--due' : ''}`} title={NEXT_REVISION_HINT}>
                            next revision {next.label}
                            {next.reason && <em className="floor-detail__next-why"> · {next.reason}</em>}
                        </span>
                    )}
                </div>
            )}
        </div>
    )
}
CoverageDetail.propTypes = { coverage: PropTypes.object.isRequired }
