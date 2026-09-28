import PropTypes from 'prop-types'
import './EntryTable.scss'

// The ENTRIES gate: per trade, the ways in that Mentor tested on this ticker
// (docs/design/mentor-flow-intent.md #10, 4.2). The second and last of the build's two gates.
//
// TWO LEVELS, deliberately. Four trades with three entries each is twelve rows, and twelve rows is
// not a choice — it is a wall the user rubber-stamps or hands straight back. So: one block per
// trade, Mentor's own pick expanded inside it, the rest named but folded behind "other ways in".
// The user reads four things and opens the one they care about.
//
// The line that carries the most risk is `semantics`. ALTERNATIVES means the first trigger to fire
// takes the whole position; SCALE_IN means each takes its share and all may fire. That is the
// difference between one position and three, so it is stated on the block rather than implied by
// the fact that there is a list.

const SEMANTICS_COPY = {
    alternatives: 'first one to fire takes the position — the others are cancelled',
    scale_in:     'scaling in — each of these takes its share of the size',
}

function Option({ option, expanded, onPick }) {
    return (
        <li className={`entry-table__option${expanded ? ' is-open' : ''}`}>
            <button type="button" className="entry-table__pick" onClick={() => onPick?.(option)}>
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
            </button>
        </li>
    )
}

Option.propTypes = {
    option:   PropTypes.object.isRequired,
    expanded: PropTypes.bool,
    onPick:   PropTypes.func,
}

export function EntryTable({ entries, spans, onPick }) {
    const trades = entries?.trades ?? []
    if (!trades.length) return null

    const labelOf = (id) => spans?.candidates?.find(c => c.id === id)?.label ?? id

    return (
        <div className="entry-table">
            <p className="entry-table__lead">Ways in — pick one per trade, or tell me to choose.</p>

            {trades.map((t) => {
                const rest = t.options.filter(o => !o.recommended)
                return (
                    <section className="entry-table__trade" key={t.id}>
                        <h4 className="entry-table__trade-name">{labelOf(t.id)}</h4>
                        <p className={`entry-table__semantics entry-table__semantics--${t.semantics}`}>
                            {SEMANTICS_COPY[t.semantics]}
                        </p>

                        <ul className="entry-table__options">
                            {t.options.filter(o => o.recommended).map(o => (
                                <Option key={o.id} option={o} expanded onPick={onPick} />
                            ))}
                        </ul>

                        {rest.length > 0 && (
                            <details className="entry-table__rest">
                                <summary>{rest.length} other way{rest.length > 1 ? 's' : ''} in</summary>
                                <ul className="entry-table__options">
                                    {rest.map(o => <Option key={o.id} option={o} expanded onPick={onPick} />)}
                                </ul>
                            </details>
                        )}
                    </section>
                )
            })}
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
    spans:  PropTypes.object,
    onPick: PropTypes.func,
}
