import PropTypes from 'prop-types'
import { ZoneEditor } from './ZoneEditor.jsx'
import { ConditionList } from './ConditionList.jsx'
import { Step } from './Step.jsx'
import './ScenarioBlock.scss'

// ONE ENTRY SCENARIO — one way into the trade.
//
// Called an "entry scenario" in the UI (2026-08-20). The premise IS the entry: a condition, and the
// price that condition applies at. The exit hangs off it as a counterpart rather than as more of the
// same, which is why the authoring layout splits them. Mentor's own prompt still says "way in" for
// the same thing — align that when the prompt is next revised, not before.
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

// Exported: the collapsed preview line names the entry band in the same words this block does
// (SetupSummary.setupDigest). One formatter, so the two can never disagree about 238 vs 238–240.
export const fmtZone = (z) => {
    if (!z) return null
    if (z.lower == null && z.upper == null) return null
    if (z.lower === z.upper) return `${z.lower}`
    return `${z.lower ?? '?'}–${z.upper ?? '?'}`
}

function validityLine(v, direction) {
    if (!v) return null
    const long  = direction !== 'short'
    const dies  = long ? v.lower : v.upper
    const away  = v.approach ?? (long ? v.upper : v.lower)
    const parts = []
    if (dies != null) parts.push(`dead on a close ${long ? 'below' : 'above'} ${dies}`)
    if (away != null) parts.push(`gone ${long ? 'above' : 'below'} ${away}`)
    if (v.on_break)   parts.push(v.on_break === 'close' ? 'then it just dies' : v.on_break === 'revise' ? 'then re-draw it' : 'notify only')
    return parts.join(' · ')
}

/**
 * `authoring` turns the premise's own fields — its name and its conditions — into inputs, and is
 * how the express form differs from the build worksheet. `lockPrices` narrows that further for a
 * plan someone else drew: their levels, your size (see ZoneEditor).
 */
export function ScenarioBlock({
    scenario, direction, index, armed = false, dead = false, onChange, onRemove,
    readOnly = false, removable = false, authoring = false, lockPrices = false, pricesOnly = false,
    stepFrom = null,
}) {
    if (!scenario) return null

    // "Entry scenario", not "way in". The premise IS the entry — its condition and the price that
    // condition applies at — and calling it that is what makes the Exit block below read as its
    // counterpart rather than as more of the same.
    const name  = scenario.name?.trim() || `Entry scenario ${index + 1}`
    const entry = fmtZone(scenario.entry_zones?.[0])
    const valid = validityLine(scenario.validity, direction)
    const edit  = authoring && !readOnly
    // A shared plan is READ in the authoring layout too — the entry/exit split is how the form is
    // laid out, not a property of being able to change it.
    const authoringLayout = authoring && !readOnly

    // A step is DONE when it holds a real number, not when a row exists — the express form renders a
    // ready-to-type row for every level, so counting rows would tick all three the moment it opened.
    const priced    = (zs) => (zs ?? []).some(z => Number.isFinite(z?.lower) || Number.isFinite(z?.upper))
    const hasEntry  = priced(scenario.entry_zones)
    const hasStop   = priced(scenario.stop_zones)
    const hasTarget = priced(scenario.tp_zones)

    return (
        <section className={`scenario-block${armed ? ' is-armed' : ''}${dead ? ' is-dead' : ''}`} aria-label={`Scenario ${name}`}>
            <header className="scenario-block__head">
                {edit && !lockPrices ? (
                    <input
                        className="scenario-block__name-input" value={scenario.name ?? ''}
                        placeholder={`Entry scenario ${index + 1}`} aria-label={`Name for entry scenario ${index + 1}`}
                        title="What you call this premise — 'the fade', 'break and go'. Only for you; the monitor reads the levels."
                        onChange={e => onChange?.({ ...scenario, name: e.target.value })}
                    />
                ) : (
                    <h4 className="scenario-block__name">{name}</h4>
                )}
                {entry && <span className="scenario-block__entry">{entry}</span>}

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

                {!readOnly && !lockPrices && removable && (
                    <button type="button" className="scenario-block__remove" onClick={() => onRemove?.(scenario.id)} aria-label={`Remove ${name}`}>
                        ×
                    </button>
                )}
            </header>

            {/* ENTRY AND EXIT ARE SPLIT WHILE AUTHORING, and joined the rest of the time.
                They are two different kinds of thinking: the entry is a premise — a condition and
                the price it applies at — and the exit is arithmetic, a stop and the levels it pays
                at. Someone typing a plan they already have works down that split. The build
                worksheet keeps all three groups together, because there it is a reference you glance
                at rather than a form you work through. */}
            {authoringLayout ? (
                <>
                    <Wrap
                        step={stepFrom} done={hasEntry} title="What gets you in?"
                        hint="Say it the way you would say it out loud, then the price it applies at. The monitor reads the sentence and picks its own tools — you do not have to phrase it for a machine."
                    >
                        <ConditionList
                            conditions={scenario.conditions}
                            title="Takes this entry when"
                            hint="What the monitor checks at THIS entry's price. A rival scenario's conditions describe a different trade and are never graded here."
                            // Scoped to the premise so a condition id is unique across the whole
                            // document — the monitor keeps ONE resolved-condition ledger for the
                            // setup, and two rows answering to `c1` would let one latch answer for
                            // the other.
                            idPrefix={`${scenario.id ?? 's'}c`}
                            // Locked means locked: their conditions are as much their plan as their
                            // prices are, and only the sizes are yours.
                            onChange={lockPrices ? null : (next => onChange?.({ ...scenario, conditions: next }))}
                        />
                        <ZoneEditor
                            scenario={scenario} direction={direction} onChange={onChange}
                            readOnly={readOnly} lockPrices={lockPrices} pricesOnly={pricesOnly}
                            groups={['entry_zones']}
                        />
                    </Wrap>

                    <Wrap
                        step={stepFrom == null ? null : stepFrom + 1} done={hasStop} title="Where are you wrong?"
                        hint="The price that ends it. Add a note if it only counts under some condition."
                    >
                        <ZoneEditor
                            scenario={scenario} direction={direction} onChange={onChange}
                            readOnly={readOnly} lockPrices={lockPrices} pricesOnly={pricesOnly}
                            groups={['stop_zones']}
                        />
                    </Wrap>

                    <Wrap
                        step={stepFrom == null ? null : stepFrom + 2} done={hasTarget} title="Where does it pay?"
                        hint="One price, or several to bank in stages — split the size across them. A note works the same way as on the stop."
                    >
                        <ZoneEditor
                            scenario={scenario} direction={direction} onChange={onChange}
                            readOnly={readOnly} lockPrices={lockPrices} pricesOnly={pricesOnly}
                            groups={['tp_zones']}
                        />
                    </Wrap>
                </>
            ) : (
                <>
                    {/* direction decides which edge of a target band is the take-profit and which one
                        only wakes Talos to offer a partial — see ZoneEditor.edgeNames. */}
                    <ZoneEditor scenario={scenario} direction={direction} onChange={onChange} readOnly={readOnly} lockPrices={lockPrices} />

                    <ConditionList
                        conditions={scenario.conditions}
                        title="Takes this entry when"
                        hint="What the monitor checks at THIS premise's zone. A rival scenario's conditions describe a different trade and are never graded here."
                        idPrefix={`${scenario.id ?? 's'}c`}
                        onChange={edit && !lockPrices ? (next => onChange?.({ ...scenario, conditions: next })) : null}
                    />
                </>
            )}

            {valid && (
                <p className="scenario-block__validity" title="The range outside which this premise is wrong. One dying doesn't end the setup — the setup is done when every way in has broken.">
                    {valid}
                </p>
            )}
        </section>
    )
}

/**
 * A step when the form is guiding someone, a plain titled block when it is not. Keeping both in one
 * wrapper is what stops the entry / stop / target sections drifting apart between the two modes —
 * they are the same three questions either way, only differently framed.
 */
function Wrap({ step, title, hint, done, children }) {
    if (step != null) return <Step n={step} title={title} hint={hint} done={done}>{children}</Step>
    return (
        <div className="scenario-block__group">
            <h4 className="scenario-block__group-title">{title}</h4>
            {children}
        </div>
    )
}

Wrap.propTypes = {
    step:     PropTypes.number,
    title:    PropTypes.string.isRequired,
    hint:     PropTypes.string,
    done:     PropTypes.bool,
    children: PropTypes.node,
}

ScenarioBlock.propTypes = {
    scenario: PropTypes.shape({
        id:         PropTypes.string,
        name:       PropTypes.string,
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
    // The premise's own fields become inputs (express form). Distinct from `readOnly`, which is the
    // absence of editing altogether.
    authoring: PropTypes.bool,
    // A plan drawn by someone else: levels flat, sizes live.
    lockPrices: PropTypes.bool,
    // One price per level instead of a band — Mentor draws the bands afterwards. See ZoneEditor.
    pricesOnly: PropTypes.bool,
    // Number the entry / stop / target blocks as steps N, N+1, N+2. Null = plain titled blocks.
    stepFrom:   PropTypes.number,
}
