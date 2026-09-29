import { useState } from 'react'
import PropTypes from 'prop-types'
import './EntryTable.scss'

// The ENTRIES gate: per trade, the ways in that Mentor tested on this ticker
// (docs/design/mentor-flow-intent.md #10, 4.2). The second and last of the build's two gates.
//
// TWO LEVELS, deliberately. Four trades with three entries each is twelve rows, and twelve rows is
// not a choice — it is a wall the user rubber-stamps or hands straight back. One block per trade,
// Mentor's own pick expanded inside it, the rest named but folded.
//
// MULTI-SELECT, because more than one way in is a real answer and not only when scaling: under
// `alternatives` the first trigger to fire takes the whole position and the others are cancelled,
// which is exactly "I'd take it either way, whichever comes first".
//
// A SCALE-IN TRADE TICKS AS ONE. Its options are halves of a single position whose shares must add
// to 100, so letting a user take two of three would silently author a plan that fills for less
// than they agreed. The block gets one tick and the copy says why.

const SEMANTICS_COPY = {
    alternatives: 'first one to fire takes the position — the others are cancelled',
    scale_in:     'scaling in — these are one position, so they are taken together',
}

function Option({ option, expanded, checked, disabled, onToggle }) {
    return (
        <li className={`entry-table__option${expanded ? ' is-open' : ''}${checked ? ' is-picked' : ''}`}>
            <label className="entry-table__pick">
                <input
                    type="checkbox"
                    className="entry-table__check"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => onToggle?.(option)}
                />
                <span className="entry-table__body">
                    <span className="entry-table__head">
                        <span className="entry-table__label">{option.label}</span>
                        {option.recommended && <span className="entry-table__rec" title="Mentor ranks these honestly — this is its own pick.">pick</span>}
                        {option.timeframe && <span className="entry-table__tf">{option.timeframe}</span>}
                        {option.share != null && <span className="entry-table__share">{option.share}%</span>}
                    </span>

                    {expanded && (
                        <>
                            <span className="entry-table__trigger">{option.trigger}</span>
                            {option.technique && <span className="entry-table__technique">{option.technique}</span>}
                            {/* The evidence is the whole point of the stage: it is what makes this a
                                tested way in rather than a named one. */}
                            {option.evidence && <span className="entry-table__evidence">{option.evidence}</span>}
                        </>
                    )}
                </span>
            </label>
        </li>
    )
}

Option.propTypes = {
    option:   PropTypes.object.isRequired,
    expanded: PropTypes.bool,
    checked:  PropTypes.bool,
    disabled: PropTypes.bool,
    onToggle: PropTypes.func,
}

export function EntryTable({ entries, spans, busy, onTake, onDelegate }) {
    const trades = entries?.trades ?? []
    const [picked, setPicked] = useState(() => new Set())
    if (!trades.length) return null

    const labelOf = (id) => spans?.candidates?.find(c => c.id === id)?.label ?? id

    // A scale-in trade is one position: its options go in and out of the set together.
    const toggle = (trade, option) => setPicked((prev) => {
        const next = new Set(prev)
        const ids  = trade.semantics === 'scale_in' ? trade.options.map(o => o.id) : [option.id]
        const on   = ids.every(id => next.has(id))
        for (const id of ids) { if (on) next.delete(id); else next.add(id) }
        return next
    })

    const chosen = trades.flatMap(t => t.options.filter(o => picked.has(o.id)).map(o => ({ trade: t.id, option: o })))

    return (
        <div className="entry-table">
            <p className="entry-table__lead">Ways in — tick what you want, or let Mentor choose.</p>

            {trades.map((t) => {
                const rest = t.options.filter(o => !o.recommended)
                const isChecked = (o) => picked.has(o.id)
                return (
                    <section className="entry-table__trade" key={t.id}>
                        <h4 className="entry-table__trade-name">{labelOf(t.id)}</h4>
                        <p className={`entry-table__semantics entry-table__semantics--${t.semantics}`}>
                            {SEMANTICS_COPY[t.semantics]}
                        </p>

                        <ul className="entry-table__options">
                            {t.options.filter(o => o.recommended).map(o => (
                                <Option key={o.id} option={o} expanded checked={isChecked(o)} disabled={busy} onToggle={() => toggle(t, o)} />
                            ))}
                        </ul>

                        {rest.length > 0 && (
                            <details className="entry-table__rest">
                                <summary>{rest.length} other way{rest.length > 1 ? 's' : ''} in</summary>
                                <ul className="entry-table__options">
                                    {rest.map(o => (
                                        <Option key={o.id} option={o} expanded checked={isChecked(o)} disabled={busy} onToggle={() => toggle(t, o)} />
                                    ))}
                                </ul>
                            </details>
                        )}
                    </section>
                )
            })}

            <div className="entry-table__actions">
                <button
                    type="button"
                    className="entry-table__btn entry-table__btn--go"
                    disabled={busy || !chosen.length}
                    onClick={() => onTake?.(chosen)}
                >
                    {chosen.length > 1 ? `Take these ${chosen.length}` : 'Take it'}
                </button>
                <button
                    type="button"
                    className="entry-table__btn entry-table__btn--quiet"
                    disabled={busy}
                    onClick={() => onDelegate?.()}
                >
                    You choose
                </button>
            </div>
        </div>
    )
}

EntryTable.propTypes = {
    entries: PropTypes.shape({
        trades: PropTypes.arrayOf(PropTypes.shape({
            id:        PropTypes.string,
            semantics: PropTypes.oneOf(['alternatives', 'scale_in']),
            options:   PropTypes.arrayOf(PropTypes.object),
        })),
    }),
    spans:      PropTypes.object,
    busy:       PropTypes.bool,
    onTake:     PropTypes.func,
    onDelegate: PropTypes.func,
}
