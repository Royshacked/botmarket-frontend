import PropTypes from 'prop-types'
import './SpanTable.scss'

// The SPANS gate: the ways this name could travel, before anyone has said how to get into one.
// (docs/design/mentor-flow-intent.md #8 — the first of the build's two user gates.)
//
// Not the same object as the CandidatePicker beside it. That offers complete alternative PLANS and
// picking one replaces the worksheet. This offers the trade itself — from here to there — and
// picking one says which trades are worth building mechanics for. So: rows, not cards, because the
// question is "which of these" and rows are what a trader reads down.
//
// The REJECTS are the half that makes it a choice. Mentor names what it discarded and why in one
// clause, and the user can pull one back — the trade Mentor talked itself out of is often the one
// they wanted, and without this they would never learn it had been considered.

const arrow = (from, to) => `${from} → ${to}`

export function SpanTable({ spans, onPick, onRevive }) {
    const candidates = spans?.candidates ?? []
    if (!candidates.length) return null
    const discarded = spans?.discarded ?? []

    return (
        <div className="span-table">
            <p className="span-table__lead">
                {candidates.length === 1 ? 'One way this goes' : `${candidates.length} ways this goes`} — pick the
                ones worth building.
            </p>

            <ul className="span-table__rows">
                {candidates.map((c) => (
                    <li key={c.id}>
                        <button type="button" className="span-table__row" onClick={() => onPick?.(c)}>
                            <span className="span-table__head">
                                <span className="span-table__label">{c.label}</span>
                                {c.archetype && <span className="span-table__tag">{c.archetype.replace(/_/g, ' ')}</span>}
                            </span>

                            <span className="span-table__span">{arrow(c.from, c.to)}</span>

                            {/* The numbers are optional by design: a span may be "the unfilled FVG"
                                and have none until the entries stage prices it. */}
                            {(c.from_price != null || c.to_price != null) && (
                                <span className="span-table__prices">
                                    {c.from_price != null && <span><em>from</em> {c.from_price}</span>}
                                    {c.to_price != null && <span><em>to</em> {c.to_price}</span>}
                                </span>
                            )}

                            {c.why && <span className="span-table__why">{c.why}</span>}
                            {c.invalidation && (
                                <span className="span-table__kill"><em>wrong if</em> {c.invalidation}</span>
                            )}
                        </button>
                    </li>
                ))}
            </ul>

            {discarded.length > 0 && (
                <details className="span-table__rejects">
                    <summary>{discarded.length} way{discarded.length > 1 ? 's' : ''} not taken</summary>
                    <ul>
                        {discarded.map((d, i) => (
                            <li key={`${d.label}-${i}`}>
                                <button type="button" className="span-table__reject" onClick={() => onRevive?.(d)}>
                                    <span className="span-table__reject-label">{d.label}</span>
                                    <span className="span-table__reject-why">{d.why_not}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </div>
    )
}

SpanTable.propTypes = {
    spans: PropTypes.shape({
        candidates: PropTypes.arrayOf(PropTypes.shape({
            id:           PropTypes.string,
            label:        PropTypes.string,
            archetype:    PropTypes.string,
            from:         PropTypes.string,
            to:           PropTypes.string,
            from_price:   PropTypes.number,
            to_price:     PropTypes.number,
            why:          PropTypes.string,
            invalidation: PropTypes.string,
        })),
        discarded: PropTypes.arrayOf(PropTypes.shape({
            label:   PropTypes.string,
            why_not: PropTypes.string,
        })),
    }),
    onPick:   PropTypes.func,
    onRevive: PropTypes.func,
}
