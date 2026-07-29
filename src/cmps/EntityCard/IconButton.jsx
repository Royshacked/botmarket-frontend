import PropTypes from 'prop-types'
import './IconButton.scss'

// ONE icon button for the whole app — the shell every edit / delete / small glyph control shares.
//
// It replaced five copies of the same twenty lines (card actions, table-row actions, the pop-out
// footer bin, the scan-list pencil, the portfolio group row), which had already drifted into four
// different resting colours and three different disabled treatments — and two of them re-inlined
// the EditIcon / BinIcon paths rather than importing them, so the glyphs could drift too.
//
// SHARE THE PIPE, NOT THE JUDGMENT. What lives here is the button: geometry, the colour rule
// (available = the title colour, muted grey when it isn't), stopPropagation, and the promise that
// a control which LOOKS dead IS dead. WHICH action a row offers, what it's called and when it
// locks stays with the surface that owns the entity.
//
// `lockedReason` is the one piece of API that carries meaning: it disables the button AND becomes
// the tooltip, because "you can't do this" is useless without "…because the position is live".
export function IconButton({
    icon, title, onClick,
    tone = 'plain', size = 'md',
    disabled = false, lockedReason = null, className = '',
}) {
    const locked = !!lockedReason
    const cls = [
        'icon-btn',
        tone !== 'plain' && `icon-btn--${tone}`,
        size !== 'md'    && `icon-btn--${size}`,
        className,
    ].filter(Boolean).join(' ')

    return (
        <button
            className={cls}
            // Every one of these sits inside something clickable — a card, a row, a table cell.
            // Stopping the bubble here is why no call site has to remember to.
            onClick={e => { e.stopPropagation(); if (!locked && !disabled) onClick(e) }}
            disabled={locked || disabled}
            title={lockedReason ?? title}
        >{icon}</button>
    )
}

IconButton.propTypes = {
    icon:         PropTypes.node.isRequired,
    title:        PropTypes.string,
    onClick:      PropTypes.func.isRequired,
    /** plain = accent on hover · danger = red on hover · alert = pulsing red · due = red */
    tone:         PropTypes.oneOf(['plain', 'danger', 'alert', 'due']),
    /** sm = the Floor's 26px rows */
    size:         PropTypes.oneOf(['md', 'sm']),
    disabled:     PropTypes.bool,
    lockedReason: PropTypes.string,
    className:    PropTypes.string,
}
