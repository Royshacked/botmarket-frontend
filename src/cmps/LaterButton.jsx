import PropTypes from 'prop-types'

// The muted escape at the end of an agent's action bar: leave the thing you are editing or
// reviewing WITHOUT saving it. Eight hand-written copies before this — the same sentence, the same
// role, the same always-enabled contract — across the idea chat, Atlas, Argus, Kairos and Mentor.
// The sentence had already drifted into three different button shells and would have kept drifting.
//
// Shared here is the SHELL: the words, the button semantics, and the default muted styling. What
// "later" DOES stays with the panel — clear the draft, abandon an edit, or clear and tell the
// parent the edit session ended — because what the user was in the middle of is the panel's own
// knowledge, not something a shared button can decide.
//
// `className` is a deliberate seam rather than a variant enum: most action bars are built from
// `portfolio-panel__review-btn` (the default below), but the idea chat and Atlas sit this next to a
// full-size `__generate` primary and size it to match. One panel modifier rides along the same way
// (Kairos and Mentor already appended theirs).
export const LATER_BTN_CLASS = 'portfolio-panel__review-btn portfolio-panel__review-btn--later'

export function LaterButton({ onClick, disabled = false, className = LATER_BTN_CLASS }) {
    return (
        <button type="button" className={className} onClick={onClick} disabled={disabled}>
            I&apos;ll do it later
        </button>
    )
}

LaterButton.propTypes = {
    onClick:   PropTypes.func.isRequired,
    disabled:  PropTypes.bool,
    className: PropTypes.string,
}
