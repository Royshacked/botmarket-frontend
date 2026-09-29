import PropTypes from 'prop-types'
import './StageConfirm.scss'

// THE OPENING TURN'S ANSWER, AS A PRESS.
//
// Mentor proposes direction, horizon and lens and asks "right?". Until now the only way to say yes
// was to type it, which made the settlement an INFERENCE: the model had to notice the agreement in
// prose and report it with a tag. Five live builds showed it does not — the same question came
// back a second time, every time.
//
// A button is not an inference. The client knows exactly what was pressed, sends it as an op, and
// the server settles before the model is asked anything. That is how every other confirmation in
// this app already works: Generate, Arm, every Talos card.
//
// Typing still works — the tag path is the fallback — but nobody has to rely on it.

const LABEL = { direction: 'Direction', horizon: 'Horizon', lens: 'Lens' }

export function StageConfirm({ gate, busy, onConfirm, onChange }) {
    if (!gate?.awaiting || gate.stage !== 'opening') return null

    const shown = gate.fields.filter(f => gate.values?.[f] != null)
    if (!shown.length) return null

    return (
        <div className="stage-confirm">
            <p className="stage-confirm__lead">Mentor proposes:</p>

            <ul className="stage-confirm__values">
                {shown.map(f => (
                    <li key={f}>
                        <span className="stage-confirm__label">{LABEL[f] ?? f}</span>
                        <span className="stage-confirm__value">{String(gate.values[f])}</span>
                    </li>
                ))}
            </ul>

            <div className="stage-confirm__actions">
                <button
                    type="button"
                    className="stage-confirm__btn stage-confirm__btn--yes"
                    disabled={busy}
                    onClick={() => onConfirm?.(gate.fields, false)}
                >
                    Yes — carry on
                </button>
                {/* The waiver, asked once and only here (mentor-flow-intent #14). Pressing it
                    settles the same three values AND skips the two gates, so it says so. */}
                <button
                    type="button"
                    className="stage-confirm__btn"
                    disabled={busy}
                    title="Mentor builds the trades and the ways in without stopping, and picks up again at sizing."
                    onClick={() => onConfirm?.(gate.fields, true)}
                >
                    Yes — go all the way to sizing
                </button>
                <button
                    type="button"
                    className="stage-confirm__btn stage-confirm__btn--quiet"
                    disabled={busy}
                    onClick={() => onChange?.()}
                >
                    Change something
                </button>
            </div>
        </div>
    )
}

StageConfirm.propTypes = {
    gate: PropTypes.shape({
        stage:    PropTypes.string,
        awaiting: PropTypes.bool,
        fields:   PropTypes.arrayOf(PropTypes.string),
        values:   PropTypes.object,
    }),
    busy:      PropTypes.bool,
    onConfirm: PropTypes.func,
    onChange:  PropTypes.func,
}
