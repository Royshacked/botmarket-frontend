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
// reads.
//
// AND one component in two MODES. It is read-only by design, and that reasoning holds everywhere it
// currently applies: conditions come out of the conversation, where they can be argued with, so a
// text box in the middle of a build would invite editing a sentence without re-testing whether
// anyone could check it. Mentor's worksheet is always handed this list read-only.
//
// `onChange` turns the rows into fields, for a surface where there is no conversation to argue in —
// the user IS the author, and refusing them a text box would not make their condition more
// checkable. That surface was the express form; it is gone (see SetupSummary's note on `authoring`)
// and no caller passes `onChange` today. Absent, nothing changes for anyone.
//
// The three tags above are read in BOTH modes and written in neither: they are Mentor'''s reading of
// a sentence, so the editor takes text alone and the tags appear here once it has done that work.
// See ConditionFields.

const MODE_HINT = {
    measured:      'A hard test you named — the monitor applies exactly that, not its own read.',
    discretionary: 'Judgment you handed over. Two traders can disagree here and both be doing their job.',
}

const PERSISTENCE_HINT = {
    latching: 'An event. Once it happens it stays true, so it is checked until it lands and then never re-asked.',
    live:     'A state. Re-checked on every wake, because it can flip on the next candle.',
}

export function ConditionList({ conditions, title, hint, onChange = null, idPrefix = 'c' }) {
    const editing = typeof onChange === 'function'
    const list    = conditions ?? []
    // Read-only with nothing to show is nothing to show. AUTHORING with nothing to show is the
    // whole reason the user opened the form.
    if (!list.length && !editing) return null

    if (editing) return <ConditionFields conditions={list} title={title} hint={hint} onChange={onChange} idPrefix={idPrefix} />

    return (
        <section className="condition-list">
            <h4 className="condition-list__title" title={hint}>{title}</h4>
            {list.map(c => (
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

/**
 * The authoring half — TEXT, and nothing else.
 *
 * It used to carry three selectors beside every row: weight (primary / confirming), mode (measured /
 * judgment) and persistence (live / latching). They are gone, and their absence is the point.
 *
 * Those three are an INTERPRETATION of a sentence, not part of it. Whether "holds above the 4hr
 * VWAP" is the trigger or a supporting read, whether it is a hard test or a judgment handed over,
 * whether it latches once or has to be re-checked every wake — a trader knows what they meant and
 * has no reason to know that this app files it under three axes, or what `latching` buys them. It is
 * the same filing the lens was, and it belongs where the lens went: to Mentor, which reads the
 * sentence when it draws the zones and tags it (see the express hand-off in its prompt).
 *
 * So a row is a sentence and a way to delete it. Untagged rows fall to the normaliser's defaults —
 * `confirming` / `judgment` / `live`, all three of which UNDER-claim on purpose — which is the right
 * resting state for the one path that skips Mentor: a stopped hand-off leaves a setup that checks
 * more than it needs to, never one that arms on a trigger nobody chose.
 */
function ConditionFields({ conditions, title, hint, onChange, idPrefix }) {
    const patch = (id, value) => onChange(conditions.map(c => (c.id === id ? { ...c, text: value } : c)))

    // Ids are minted here rather than left to the server because React needs a stable key the moment
    // the row exists; `idPrefix` keeps them unique across the document, which is what lets the
    // monitor's resolved-condition ledger key by them.
    const add = () => onChange([...conditions, {
        id:   `${idPrefix}${conditions.length + 1}_${Math.random().toString(36).slice(2, 6)}`,
        text: '',
    }])

    return (
        <section className="condition-list condition-list--editing">
            {title && <h4 className="condition-list__title" title={hint}>{title}</h4>}

            {conditions.map((c, i) => (
                <div className="condition-list__row is-editing" key={c.id}>
                    <textarea
                        className="condition-list__input" rows={2} value={c.text ?? ''}
                        placeholder={i === 0
                            ? 'e.g. closes back above the prior-day high on the 15min'
                            : 'and…'}
                        aria-label={`Condition ${i + 1}`}
                        onChange={e => patch(c.id, e.target.value)}
                    />
                    <button
                        type="button" className="condition-list__remove"
                        onClick={() => onChange(conditions.filter(x => x.id !== c.id))}
                        aria-label={`Remove condition ${i + 1}`}
                        title="Remove"
                    >
                        ×
                    </button>
                </div>
            ))}

            {/* An INVITATION, not a chip. When the list is empty this is the only thing in the step,
                so it has to say what it wants and look pressable; a bare "+" beside a heading reads
                as punctuation. It carries the example too, because "what counts as a condition" is
                the question someone actually has at this point. */}
            <button type="button" className="condition-list__add" onClick={add}>
                <span className="condition-list__add-plus" aria-hidden="true">+</span>
                <span className="condition-list__add-text">
                    {conditions.length ? 'Add another condition' : 'Add what has to happen'}
                    <em>{conditions.length ? 'both have to hold' : 'in your own words — the monitor reads the sentence'}</em>
                </span>
            </button>
        </section>
    )
}

const conditionShape = PropTypes.shape({
    id:          PropTypes.string,
    text:        PropTypes.string,
    weight:      PropTypes.string,
    mode:        PropTypes.string,
    persistence: PropTypes.string,
})

ConditionList.propTypes = {
    conditions: PropTypes.arrayOf(conditionShape),
    title: PropTypes.string,
    hint:  PropTypes.string,
    // Present = authoring. Receives the whole next list, matching how ZoneEditor patches a group.
    onChange: PropTypes.func,
    // Keeps minted ids unique across the document — the root tier and each scenario pass their own.
    idPrefix: PropTypes.string,
}

ConditionFields.propTypes = {
    conditions: PropTypes.arrayOf(conditionShape).isRequired,
    title:      PropTypes.string,
    hint:       PropTypes.string,
    onChange:   PropTypes.func.isRequired,
    idPrefix:   PropTypes.string.isRequired,
}
