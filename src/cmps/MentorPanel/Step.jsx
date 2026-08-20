import PropTypes from 'prop-types'
import './Step.scss'

// One numbered step of the express form.
//
// THE USER DOES NOT KNOW WHAT A SETUP DOCUMENT IS, and should not have to. The worksheet the build
// conversation shows is a picture of an artifact — scenarios, zones, condition tiers — which is the
// right shape for glancing at something Mentor is assembling, and the wrong shape for someone who
// has to fill it in. A form laid out as a data structure asks the reader to reverse-engineer the
// structure before they can answer the first question.
//
// So the express form is a SEQUENCE instead: numbered, one concern per step, each saying what it
// wants in the words a trader would use. Nothing about the underlying document changes — the same
// draft comes out the other end — but the order is now the order someone actually thinks in:
// what am I trading, which way, over what span, off which chart, in where, out where.
//
// `done` is a quiet tick rather than a gate. Steps are not enforced in order and never block each
// other: someone who knows their stop before their horizon should type their stop. The mark is
// there so a half-filled form can be read at a glance, not to police the sequence.

export function Step({ n, title, hint, done = false, children }) {
    return (
        <section className={`step${done ? ' is-done' : ''}`} aria-label={`Step ${n}: ${title}`}>
            <header className="step__head">
                <span className="step__n" aria-hidden="true">{done ? '✓' : n}</span>
                <h4 className="step__title">{title}</h4>
            </header>
            {hint && <p className="step__hint">{hint}</p>}
            <div className="step__body">{children}</div>
        </section>
    )
}

Step.propTypes = {
    n:        PropTypes.number.isRequired,
    title:    PropTypes.string.isRequired,
    // One line, in a trader's words, saying what this step wants. Not a definition of the field.
    hint:     PropTypes.string,
    done:     PropTypes.bool,
    children: PropTypes.node,
}
