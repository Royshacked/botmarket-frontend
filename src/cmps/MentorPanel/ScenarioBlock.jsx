import PropTypes from 'prop-types'
import { ZoneEditor } from './ZoneEditor.jsx'
import { words, archetypeHint, awayLabel } from '../../services/setupTaxonomy.js'
import { ConditionList } from './ConditionList.jsx'
import './ScenarioBlock.scss'

// ONE ENTRY SCENARIO — one way into the trade.
//
// Called an "entry scenario" in the UI (2026-08-20). The premise IS the entry: a condition, and the
// price that condition applies at; the exit hangs off it as a counterpart. Mentor's own prompt still
// says "way in" for the same thing — align that when the prompt is next revised, not before.
//
// A false break at 238 and a break-and-go at 244 are not two legs of one entry — they are rival
// premises that happen to share a ticker and a direction, and they disagree about everything else:
// what confirms them, where the stop belongs, what price proves them dead. So a scenario is drawn as
// a block that owns all of it, and the user can see at a glance that they have two ways in.
//
// RIVALS, NOT LEGS: the first to fulfil takes the WHOLE trade and the others die with it, so each
// block's size is the full position and the numbers are never added across blocks. That is why the
// size sits inside the block rather than in a total at the top.
//
// `armed` = price is in this premise's zone right now (or it is the one that fired). `dead` = its
// own validity range broke, which does NOT mean the setup is over — a rival can still be live, and
// showing that is the entire point of rendering every scenario instead of one set of levels.

// Exported: the collapsed preview line names the entry in the same words this block does
// (SetupSummary.setupDigest). One formatter, so the two can never disagree about what a level is.
//
// It used to collapse a band and print `238–240` when the edges differed. There are no edges
// (2026-09-24) — a leg is a price — so all that is left is "is there a number".
export const fmtLeg = (z) => (z?.price == null ? null : `${z.price}`)

// BOTH EDGES, each with its own authored answer. They are different events — one is "the premise
// broke", the other is "it went without you" — and the away side had no answer at all until
// 2026-09-26 (`on_away`). Printing the pivot without what happens at it was the half that read as
// information and was not: knowing price can run to 246 says nothing about whether anybody will tell
// you when it does.
function validityLine(v, direction) {
    if (!v) return null
    const long  = direction !== 'short'
    const dies  = long ? v.lower : v.upper
    const away  = v.approach ?? (long ? v.upper : v.lower)
    const parts = []
    if (dies != null) parts.push(`dead on a close ${long ? 'below' : 'above'} ${dies}`)
    if (v.on_break)   parts.push(v.on_break === 'close' ? 'then it just dies' : v.on_break === 'revise' ? 'then re-draw it' : 'notify only')
    if (away != null) parts.push(`gone ${long ? 'above' : 'below'} ${away}`)
    // No answer yet is worth SAYING, not hiding: it is what Generate is refusing on, so the line the
    // user reads while wondering why the button is dark should be the line that tells them.
    parts.push(awayLabel(v.on_away) ?? 'no answer yet if it runs')
    return parts.join(' · ')
}

// The name and the conditions are READ here; the levels are edited (ZoneEditor). An `authoring`
// mode that made the name and conditions inputs too, split entry from exit into numbered steps and
// could freeze the levels of a plan someone else drew (`lockPrices`) was deleted 2026-09-21 with the
// rest of the express form's body — see SetupSummary's note.
export function ScenarioBlock({
    scenario, direction, index, armed = false, dead = false, onChange, onRemove,
    readOnly = false, removable = false,
}) {
    if (!scenario) return null

    // "Entry scenario", not "way in". The premise IS the entry — its condition and the price that
    // condition applies at — and calling it that is what makes the Exit block below read as its
    // counterpart rather than as more of the same.
    const name  = scenario.name?.trim() || `Entry scenario ${index + 1}`
    const entry = fmtLeg(scenario.entry_legs?.[0])
    const valid = validityLine(scenario.validity, direction)

    return (
        <section className={`scenario-block${armed ? ' is-armed' : ''}${dead ? ' is-dead' : ''}`} aria-label={`Scenario ${name}`}>
            <header className="scenario-block__head">
                <h4 className="scenario-block__name">{name}</h4>
                {entry && <span className="scenario-block__entry">{entry}</span>}

                {scenario.archetype && (
                    // Mentor's filing of its own plan, and the thing that makes a level arguable:
                    // "why THAT stop" has an answer from a closed set rather than a paragraph.
                    <span className="scenario-block__badge scenario-block__badge--archetype"
                        title={archetypeHint(scenario.archetype) ?? 'The way in, as Mentor filed it.'}>
                        {words(scenario.archetype)}
                    </span>
                )}

                {armed && <span className="scenario-block__badge scenario-block__badge--armed" title="Price is at this premise's zone — this is the one being judged.">armed</span>}
                {dead  && <span className="scenario-block__badge scenario-block__badge--dead" title="This premise broke its own validity range. Any other entry scenario is unaffected.">dead</span>}

                {scenario.rr != null && (
                    <span className={`scenario-block__rr${scenario.rr < 1.5 ? ' is-thin' : ''}`} title="Reward-to-risk for THIS premise, measured from the worst edge of its entry band against its own stop and first target.">
                        {scenario.rr}R
                    </span>
                )}
                {scenario.quantity != null && (
                    <span className="scenario-block__size" title="The whole position. Scenarios are rivals — whichever fulfils first takes the trade, so sizes are never added together.">
                        {scenario.quantity}
                    </span>
                )}

                {!readOnly && removable && (
                    <button type="button" className="scenario-block__remove" onClick={() => onRemove?.(scenario.id)} aria-label={`Remove ${name}`}>
                        ×
                    </button>
                )}
            </header>

            {/* direction decides which edge of a target band is the take-profit and which one
                only wakes Talos to offer a partial — see ZoneEditor.edgeNames. */}
            <ZoneEditor scenario={scenario} onChange={onChange} readOnly={readOnly} />

            <ConditionList
                conditions={scenario.conditions}
                title="Takes this entry when"
                hint="What the monitor checks at THIS premise's zone. A rival scenario's conditions describe a different trade and are never graded here."
                // Scoped to the premise so a condition id is unique across the whole document — the
                // monitor keeps ONE resolved-condition ledger for the setup, and two rows answering
                // to `c1` would let one latch answer for the other.
                idPrefix={`${scenario.id ?? 's'}c`}
                onChange={null}
            />

            {valid && (
                <p className="scenario-block__validity" title="The range outside which this premise is wrong. One dying doesn't end the setup — the setup is done when every way in has broken.">
                    {valid}
                </p>
            )}
        </section>
    )
}

ScenarioBlock.propTypes = {
    scenario: PropTypes.shape({
        id:         PropTypes.string,
        name:       PropTypes.string,
        archetype:  PropTypes.string,
        quantity:   PropTypes.number,
        rr:         PropTypes.number,
        conditions: PropTypes.array,
        validity:   PropTypes.object,
    }),
    direction: PropTypes.oneOf(['long', 'short']),
    index:     PropTypes.number.isRequired,
    armed:     PropTypes.bool,
    dead:      PropTypes.bool,
    onChange:  PropTypes.func,
    onRemove:  PropTypes.func,
    readOnly:  PropTypes.bool,
    removable: PropTypes.bool,
}
