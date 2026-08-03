import PropTypes from 'prop-types'
import { ZoneEditor } from './ZoneEditor.jsx'
import { ConditionList } from './ConditionList.jsx'
import './ScenarioBlock.scss'

// ONE WAY INTO THE TRADE.
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

const fmtZone = (z) => {
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

export function ScenarioBlock({ scenario, direction, index, armed = false, dead = false, onChange, onRemove, readOnly = false, removable = false }) {
    if (!scenario) return null

    const name  = scenario.name?.trim() || `Way in ${index + 1}`
    const entry = fmtZone(scenario.entry_zones?.[0])
    const valid = validityLine(scenario.validity, direction)

    return (
        <section className={`scenario-block${armed ? ' is-armed' : ''}${dead ? ' is-dead' : ''}`} aria-label={`Scenario ${name}`}>
            <header className="scenario-block__head">
                <h4 className="scenario-block__name">{name}</h4>
                {entry && <span className="scenario-block__entry">{entry}</span>}

                {armed && <span className="scenario-block__badge scenario-block__badge--armed" title="Price is at this premise's zone — this is the one being judged.">armed</span>}
                {dead  && <span className="scenario-block__badge scenario-block__badge--dead" title="This premise broke its own validity range. Any other way in is unaffected.">dead</span>}

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

            <ZoneEditor scenario={scenario} onChange={onChange} readOnly={readOnly} />

            <ConditionList
                conditions={scenario.conditions}
                title="Takes this way in when"
                hint="What the monitor checks at THIS premise's zone. A rival scenario's conditions describe a different trade and are never graded here."
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
    scenario:  PropTypes.object,
    direction: PropTypes.string,
    index:     PropTypes.number,
    armed:     PropTypes.bool,
    dead:      PropTypes.bool,
    onChange:  PropTypes.func,
    onRemove:  PropTypes.func,
    readOnly:  PropTypes.bool,
    removable: PropTypes.bool,
}
