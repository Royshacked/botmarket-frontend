import { useState } from 'react'
import PropTypes from 'prop-types'
import './CoverageBook.scss'
import { CoverageActions } from './CoverageActions.jsx'
import { PriceTarget } from '../PriceTarget/PriceTarget.jsx'
import { nextRevision, NEXT_REVISION_HINT } from './coverage.utils.js'

// The Analyst's living book — a read view of the `coverage` collection: our variant thesis, our
// price target vs the Street (the gap = the edge), the rating, and the status the monitor maintains.

const RATING_LABEL = { strong_buy: 'strong buy', buy: 'buy', hold: 'hold', sell: 'sell', strong_sell: 'strong sell' }
const STATUS_LABEL = { active: 'active', target_hit: 'target hit', thesis_broken: 'thesis broken', retired: 'retired', watchlist: 'watchlist' }

function CoverageCard({ c, onEdit, onRetire, onDelete }) {
    const [open, setOpen] = useState(false)
    const pt   = c.price_target
    const gap  = c.gap
    const kills = Array.isArray(c.kill_criteria) ? c.kill_criteria : []
    const cats  = Array.isArray(c.catalysts) ? c.catalysts : []
    const next  = nextRevision(c)
    // `next` counts toward openability too: on a thesis with nothing else written, the schedule is
    // the only thing in the drawer — but it is still something, and a chevron-less row hides it.
    const hasDetail = c.thesis || kills.length > 0 || cats.length > 0 || (c.revisions?.length > 0) || !!next

    return (
        <div className="coverage-book__card">
            <div className="coverage-book__row" role="button" tabIndex={0} onClick={() => hasDetail && setOpen(o => !o)}
                onKeyDown={e => { if (hasDetail && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(o => !o) } }}>
                <span className="coverage-book__sym">{c.symbol}</span>
                {c.rating && <span className={`coverage-book__rating coverage-book__rating--${c.rating}`}>{RATING_LABEL[c.rating] ?? c.rating}</span>}
                <PriceTarget priceTarget={pt} gap={gap} />
                <span className={`coverage-book__status coverage-book__status--${c.status}`}>{STATUS_LABEL[c.status] ?? c.status}</span>
                {/* On the ROW, not in the expanded detail. Actions that only appear once you have
                    opened a thesis are actions nobody finds — and unlike the trade desks there is no
                    hover overlay here to fall back on. CoverageActions stops its own clicks, so
                    pressing Edit never toggles the card underneath. */}
                <CoverageActions coverage={c} onEdit={onEdit} onRetire={onRetire} onDelete={onDelete} />
            </div>

            {open && (
                <div className="coverage-book__detail">
                    {c.thesis && <p className="coverage-book__thesis">{c.thesis}</p>}
                    {kills.length > 0 && (
                        <div className="coverage-book__block">
                            <span className="coverage-book__block-label">kill-criteria</span>
                            <ul>{kills.map((k, i) => <li key={i}>{typeof k === 'string' ? k : JSON.stringify(k)}</li>)}</ul>
                        </div>
                    )}
                    {cats.length > 0 && (
                        <div className="coverage-book__block">
                            <span className="coverage-book__block-label">catalysts</span>
                            <ul>{cats.map((k, i) => <li key={i}>{k?.date ? `${k.date}: ` : ''}{k?.note ?? (typeof k === 'string' ? k : '')}</li>)}</ul>
                        </div>
                    )}
                    <div className="coverage-book__foot">
                        {c.revisions?.length > 0 && <span className="coverage-book__revs">{c.revisions.length} revision{c.revisions.length > 1 ? 's' : ''}</span>}
                        {/* The trail behind and the schedule ahead, on the same line — one reads as
                            the continuation of the other. */}
                        {next && (
                            <span className={`coverage-book__next${next.due ? ' coverage-book__next--due' : ''}`} title={NEXT_REVISION_HINT}>
                                next revision {next.label}
                                {next.reason && <em className="coverage-book__next-why"> · {next.reason}</em>}
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
CoverageCard.propTypes = { c: PropTypes.object.isRequired, onEdit: PropTypes.func, onRetire: PropTypes.func, onDelete: PropTypes.func }

export function CoverageBook({ coverage = [], loading = false, onEdit, onRetire, onDelete }) {
    if (loading) return <div className="coverage-book__loader"><span /><span /><span /></div>
    if (!coverage.length) return <p className="coverage-book__empty">No coverage yet — research a name in the Analyst to start a living thesis.</p>
    return (
        <div className="coverage-book">
            {coverage.map(c => <CoverageCard key={c.id ?? c.symbol} c={c} onEdit={onEdit} onRetire={onRetire} onDelete={onDelete} />)}
        </div>
    )
}
CoverageBook.propTypes = {
    coverage: PropTypes.array,
    loading:  PropTypes.bool,
    onEdit:   PropTypes.func,
    onRetire: PropTypes.func,
    onDelete: PropTypes.func,
}
