import PropTypes from 'prop-types'
import { StatusIcon } from '../StatusIcon.jsx'
import { EditIcon, BinIcon, BuildingIcon } from './entityIcons.jsx'

// ONE card shell for every entity list — ideas, calls, setups.
//
// The frontend mirror of the backend's entityCrud: the SHELL is mechanism and lives here, the
// CONTENT is judgment and stays with the kind. What a setup's zones read like, which statuses a
// call can be confirmed from, whether an idea is missing exits — those are per-kind decisions the
// caller composes and passes in. The frame, the click rules and the control chrome are shared.
//
// It exists because the three cards had already diverged: CallCard reused the ideas card's classes
// verbatim (importing its icons from TradeIdeaCards.jsx, which made a card file an icon library),
// while SetupCard grew a parallel `.setup-card` block with its own stylesheet — so a setup looked
// like a different application than the idea sitting one tab away.
//
// CLASS NAMES: the shell still emits `idea-card*`. That name is now the SHARED shell's name, not
// the idea kind's — ~360 lines of TradeIdeas.scss plus MonitorDashboard.scss key off it, and
// renaming is a cosmetic pass with real regression surface, worth doing on its own.

/** Clicks that must never open the card: the controls column, and the ticker (→ chart). */
function isPassthroughClick(ev) {
    return !!(ev.target.closest('.idea-card__controls') || ev.target.closest('.idea-card__sym'))
}

/**
 * @param {string}      status     drives the `idea-card--{status}` lifecycle colour
 * @param {ReactNode}   badge      the owning agent's badge (Minos / Hermes / Talos / Atlas)
 * @param {ReactNode}   title      titleline content — symbol, direction, pills
 * @param {ReactNode}   [summary]  the one-line "what is this" row
 * @param {ReactNode}   [footer]   optional extra row under the summary (a setup's Talos memo)
 * @param {ReactNode}   [controls] right-hand action column
 * @param {Function}    [onOpen]   card-body click. Omit for a non-clickable card (a building draft).
 */
export function EntityCard({
    status, badge, title, summary, footer, controls,
    onOpen, className = '', cardTitle,
}) {
    function handleClick(ev) {
        if (!onOpen || isPassthroughClick(ev)) return
        onOpen(ev)
    }

    return (
        <article
            className={`idea-card idea-card--${status}${className ? ` ${className}` : ''}`}
            onClick={handleClick}
            title={cardTitle}
            style={onOpen ? undefined : { cursor: 'default' }}
        >
            {badge && <div className="idea-card__icon" aria-hidden="true">{badge}</div>}

            <div className="idea-card__body">
                <div className="idea-card__titleline">{title}</div>
                {summary && <div className="idea-card__summary">{summary}</div>}
                {footer}
            </div>

            {controls && <div className="idea-card__controls">{controls}</div>}
        </article>
    )
}

EntityCard.propTypes = {
    status:    PropTypes.string.isRequired,
    badge:     PropTypes.node,
    title:     PropTypes.node.isRequired,
    summary:   PropTypes.node,
    footer:    PropTypes.node,
    controls:  PropTypes.node,
    onOpen:    PropTypes.func,
    className: PropTypes.string,
    cardTitle: PropTypes.string,
}

// ── Shared parts ──────────────────────────────────────────────────────────────
// Each was written two or three times across the cards with the same classes and the same
// stopPropagation dance.

/** The ticker. Clicking it opens the chart, never the card (see isPassthroughClick). */
export function SymbolCell({ symbol, onSymbolClick }) {
    const clickable = !!(symbol && onSymbolClick)
    return (
        <span
            className="idea-card__sym"
            onClick={clickable ? (e => { e.stopPropagation(); onSymbolClick(symbol) }) : undefined}
            title={clickable ? `View ${symbol} chart` : undefined}
            style={{ cursor: clickable ? 'pointer' : 'default' }}
        >{symbol || '—'}</span>
    )
}
SymbolCell.propTypes = { symbol: PropTypes.string, onSymbolClick: PropTypes.func }

/** A titleline pill. `variant` picks the modifier (dir / type / lens …). */
export function Pill({ variant, className = '', children, title }) {
    return (
        <span className={`idea-card__pill idea-card__pill--${variant}${className ? ` ${className}` : ''}`} title={title}>
            {children}
        </span>
    )
}
Pill.propTypes = {
    variant: PropTypes.string.isRequired, className: PropTypes.string,
    children: PropTypes.node, title: PropTypes.string,
}

/**
 * Lifecycle status. Read-only badge, or a toggle when `onToggle` is given — the same element the
 * ideas card used for activate/deactivate and the setups card needs for arm/disarm.
 *
 * `iconStatus` lets a kind whose vocabulary differs (a call's `watching` / `ready`) borrow the
 * closest shared icon without renaming its own status.
 */
export function StatusBadge({ status, iconStatus, label, onToggle, disabled = false }) {
    const icon = iconStatus ?? status
    if (!onToggle) {
        return (
            <span className={`idea-card__status-badge status--${icon}`} title={label}>
                <StatusIcon status={icon} />
            </span>
        )
    }
    return (
        <button
            className={`idea-card__status-toggle status--${icon}`}
            onClick={e => { e.stopPropagation(); onToggle(e) }}
            disabled={disabled}
            title={label}
        ><StatusIcon status={icon} /></button>
    )
}
StatusBadge.propTypes = {
    status: PropTypes.string.isRequired, iconStatus: PropTypes.string,
    label: PropTypes.string, onToggle: PropTypes.func, disabled: PropTypes.bool,
}

export function EditButton({ onClick, title = 'Edit in chat', alert = false, locked = false }) {
    return (
        <button
            className={`idea-card__edit-btn${alert ? ' idea-card__edit-btn--alert' : ''}${locked ? ' idea-card__edit-btn--locked' : ''}`}
            onClick={e => { e.stopPropagation(); onClick(e) }}
            title={title}
        ><EditIcon /></button>
    )
}
EditButton.propTypes = {
    onClick: PropTypes.func.isRequired, title: PropTypes.string,
    alert: PropTypes.bool, locked: PropTypes.bool,
}

/**
 * Delete. `lockedReason` both disables the button and explains why — every kind has some state
 * where deleting would orphan something at the broker, and each phrases it its own way.
 */
export function DeleteButton({ onClick, title = 'Delete', lockedReason = null, disabled = false }) {
    const locked = !!lockedReason
    return (
        <button
            className="idea-card__delete"
            onClick={e => { e.stopPropagation(); if (!locked) onClick(e) }}
            disabled={locked || disabled}
            title={lockedReason ?? title}
        ><BinIcon /></button>
    )
}
DeleteButton.propTypes = {
    onClick: PropTypes.func.isRequired, title: PropTypes.string,
    lockedReason: PropTypes.string, disabled: PropTypes.bool,
}

export { BuildingIcon }
