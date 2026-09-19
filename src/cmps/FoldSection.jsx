import PropTypes from 'prop-types'
import './FoldSection.scss'

// A folded section of a detail surface. Native <details>: the summary carries the title and a
// `tail` — the section's own gist — so a column with every section closed still reads as a list
// of one-line facts. The browser owns the open/closed state, so a poll that re-renders the parent
// never snaps a section the user opened back shut.
//
// Lifted out of AetherCandidates (its drawer's `Section`) when the setup pop-out needed the same
// shell — the shared shell, not the content: what goes in the tail is the caller's judgment.
//
// `className` is the caller's hook for its own modifiers (`aether-candidates__sec--warn`); the
// element always carries `fold-section` too, which is what the styles key on.

export function FoldSection({ title, tail = '', tailTitle, open = false, className = '', children }) {
    return (
        <details className={`fold-section${className ? ` ${className}` : ''}`} open={open}>
            <summary className="fold-section__summary">
                <span className="fold-section__title">{title}</span>
                {tail && <span className="fold-section__tail" title={tailTitle}>{tail}</span>}
            </summary>
            <div className="fold-section__body">{children}</div>
        </details>
    )
}

FoldSection.propTypes = {
    title:     PropTypes.string.isRequired,
    tail:      PropTypes.string,
    tailTitle: PropTypes.string,
    // The initial state only — the DOM keeps the user's toggles across re-renders.
    open:      PropTypes.bool,
    className: PropTypes.string,
    children:  PropTypes.node,
}
