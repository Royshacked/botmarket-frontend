import PropTypes from 'prop-types'
import './ConditionList.scss'

// What the monitor will actually check, in the words it was told.
//
// Conditions are TEXT — there is no taxonomy any more, because the monitor reads the sentence and
// picks its own tools. So this renders prose, and the only structure it shows is the little that
// changes how a condition is judged:
//
//   weight       primary = the trigger itself · confirming = supports, doesn't veto
//   mode         measured = a hard test the user named · discretionary = judgment they handed over
//   persistence  latching = an event that stays true once it happens · live = re-checked every wake
//
// ONE component, two tiers (SetupSummary uses it for the setup-wide list and ScenarioBlock for each
// premise's own), because the difference between them is which list you pass — not how a condition
// reads. Read-only by design: conditions come out of the conversation, where they can be argued
// with; a text box here would invite editing a sentence without re-testing whether it is checkable.

const MODE_HINT = {
    measured:      'A hard test you named — the monitor applies exactly that, not its own read.',
    discretionary: 'Judgment you handed over. Two traders can disagree here and both be doing their job.',
}

const PERSISTENCE_HINT = {
    latching: 'An event. Once it happens it stays true, so it is checked until it lands and then never re-asked.',
    live:     'A state. Re-checked on every wake, because it can flip on the next candle.',
}

export function ConditionList({ conditions, title, hint }) {
    if (!conditions?.length) return null

    return (
        <section className="condition-list">
            <h4 className="condition-list__title" title={hint}>{title}</h4>
            {conditions.map(c => (
                <div className={`condition-list__row condition-list__row--${c.weight ?? 'confirming'}`} key={c.id}>
                    <p className="condition-list__text">{c.text}</p>
                    <span className="condition-list__tags">
                        <span className="condition-list__tag" title={c.weight === 'primary' ? 'The trigger itself — if this is not happening, it is not the moment.' : 'Supports the read; a miss weakens it without vetoing it.'}>
                            {c.weight ?? 'confirming'}
                        </span>
                        {c.mode && <span className="condition-list__tag" title={MODE_HINT[c.mode]}>{c.mode}</span>}
                        {c.persistence === 'latching' && (
                            <span className="condition-list__tag condition-list__tag--latch" title={PERSISTENCE_HINT.latching}>latching</span>
                        )}
                    </span>
                </div>
            ))}
        </section>
    )
}

ConditionList.propTypes = {
    conditions: PropTypes.arrayOf(PropTypes.shape({
        id:          PropTypes.string,
        text:        PropTypes.string,
        weight:      PropTypes.string,
        mode:        PropTypes.string,
        persistence: PropTypes.string,
    })),
    title: PropTypes.string,
    hint:  PropTypes.string,
}
