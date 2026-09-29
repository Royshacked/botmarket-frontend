import { useState } from 'react'
import PropTypes from 'prop-types'
import './SpanTable.scss'

// The SPANS gate: the ways this name could travel, before anyone has said how to get into one.
// (docs/design/mentor-flow-intent.md #8 — the first of the build's two user gates.)
//
// Not the same object as the CandidatePicker beside it. That offers complete alternative PLANS and
// picking one replaces the worksheet. This offers the trade itself — from here to there — and
// choosing says which trades are worth building mechanics for.
//
// MULTI-SELECT, because the answer usually is. A build may carry up to four candidate trades and
// the design has always said several may survive the gate ("Mentor can choose one per trade option
// or a few"); a row that fired the moment it was clicked quietly made it one. So: tick what you
// want, then Build — and the count on the button says what you are about to commit to.

const arrow = (from, to) => `${from} → ${to}`

export function SpanTable({ spans, busy, onBuild, onRevive, onDelegate }) {
    const candidates = spans?.candidates ?? []
    const [picked, setPicked] = useState(() => new Set())
    if (!candidates.length) return null
    const discarded = spans?.discarded ?? []

    const toggle = (id) => setPicked((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id); else next.add(id)
        return next
    })

    const chosen = candidates.filter(c => picked.has(c.id))

    return (
        <div className="span-table">
            <p className="span-table__lead">
                {candidates.length === 1 ? 'One way this goes' : `${candidates.length} ways this goes`} — tick the
                ones worth building.
            </p>

            <ul className="span-table__rows">
                {candidates.map((c) => (
                    <li key={c.id}>
                        <label className={`span-table__row${picked.has(c.id) ? ' is-picked' : ''}`}>
                            <input
                                type="checkbox"
                                className="span-table__check"
                                checked={picked.has(c.id)}
                                disabled={busy}
                                onChange={() => toggle(c.id)}
                            />

                            <span className="span-table__body">
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
                            </span>
                        </label>
                    </li>
                ))}
            </ul>

            <div className="span-table__actions">
                <button
                    type="button"
                    className="span-table__btn span-table__btn--go"
                    disabled={busy || !chosen.length}
                    onClick={() => onBuild?.(chosen)}
                >
                    {chosen.length > 1 ? `Build these ${chosen.length}` : 'Build it'}
                </button>
                {/* The design's other half: the user may hand the choice back rather than make it. */}
                <button
                    type="button"
                    className="span-table__btn span-table__btn--quiet"
                    disabled={busy}
                    onClick={() => onDelegate?.(candidates)}
                >
                    You choose
                </button>
            </div>

            {discarded.length > 0 && (
                <details className="span-table__rejects">
                    <summary>{discarded.length} way{discarded.length > 1 ? 's' : ''} not taken</summary>
                    <ul>
                        {discarded.map((d, i) => (
                            <li key={`${d.label}-${i}`}>
                                <button type="button" className="span-table__reject" disabled={busy} onClick={() => onRevive?.(d)}>
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
    busy:       PropTypes.bool,
    onBuild:    PropTypes.func,
    onRevive:   PropTypes.func,
    onDelegate: PropTypes.func,
}
