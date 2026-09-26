import PropTypes from 'prop-types'
import { words, archetypeHint, verdictCopy } from '../../services/setupTaxonomy.js'
import './PathsNotTaken.scss'

// ── What this plan is NOT ──────────────────────────────────────────────────────
//
// Two records the backend started writing on 2026-09-26 (botmarket-backend
// docs/desks/mentor-talos.md §The paths not taken), and the only two places in the app where a plan
// says something about the trade it is not:
//
//   alternatives  the ways in this chart offered that the plan did NOT take, one clause of reasoning
//                 each. The pool a second scenario gets promoted out of.
//   challenges    what has been thrown at the direction, and what came back. Server-written — the
//                 desk cannot file a verdict about its own plan.
//
// WHY IT IS ONE COMPONENT AND NOT A BLOCK IN EACH SURFACE. Three places want it: the live worksheet
// while the plan is being built, the saved plan in the detail pop-out, and the ORDER CONFIRM — which
// is the moment it actually earns its space. You are about to put money on a pullback at 238, and the
// useful line right there is that the gap at 232 was considered and skipped, and why. Three copies of
// that would be three chances to describe the record differently from the record.
//
// It renders NOTHING when both lists are empty, which is the ordinary case on a plan the user brought
// themselves (they chose the way in, so there is no rejects pool) and on any plan nobody has attacked.
// An empty frame saying "no alternatives" would be a reproach rather than information.

/** One rejected way in: what it was, where, and the one clause of why not. */
function Alternative({ alt }) {
    const hint = archetypeHint(alt.archetype)
    return (
        <li className="paths-not-taken__alt">
            <span className="paths-not-taken__alt-name" title={hint ?? undefined}>{words(alt.archetype)}</span>
            {alt.price != null && <span className="paths-not-taken__alt-price">{alt.price}</span>}
            <span className="paths-not-taken__alt-why">{alt.why_not}</span>
        </li>
    )
}
Alternative.propTypes = { alt: PropTypes.object.isRequired }

const fmtWhen = (iso) => {
    if (!iso) return null
    try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }
    catch { return null }
}

export function PathsNotTaken({ alternatives, challenges, title = 'Considered and not taken' }) {
    const alts  = Array.isArray(alternatives) ? alternatives.filter(a => a?.archetype && a?.why_not) : []
    const tried = Array.isArray(challenges) ? challenges.filter(c => verdictCopy(c?.verdict)) : []
    if (!alts.length && !tried.length) return null

    return (
        <section className="paths-not-taken">
            {tried.length > 0 && (
                // Newest LAST in the data, so the newest verdict is the one to lead with: a plan
                // attacked twice on two different maps has an older verdict about levels that moved.
                <p className="paths-not-taken__challenges">
                    {[...tried].reverse().map((c, i) => {
                        const v    = verdictCopy(c.verdict)
                        const when = fmtWhen(c.at)
                        return (
                            <span className={`paths-not-taken__verdict paths-not-taken__verdict--${c.verdict}`} key={i} title={v.hint}>
                                Direction attacked{when ? ` ${when}` : ''} · {v.label}
                            </span>
                        )
                    })}
                </p>
            )}

            {alts.length > 0 && (
                <>
                    <span className="paths-not-taken__title" title="The ways into this chart that were looked at and rejected, as of when the plan was drawn. A reason that was true then can stop being true — a gap fill skipped because the gap was open reads differently once it fills.">
                        {title}
                    </span>
                    <ul className="paths-not-taken__alts">
                        {alts.map((a, i) => <Alternative alt={a} key={`${a.archetype}-${i}`} />)}
                    </ul>
                </>
            )}
        </section>
    )
}

PathsNotTaken.propTypes = {
    alternatives: PropTypes.array,
    challenges:   PropTypes.array,
    title:        PropTypes.string,
}
