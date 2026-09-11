import PropTypes from 'prop-types'
import { openChart } from '../../services/chartSurface.service.js'
import { StatusIcon } from '../StatusIcon.jsx'
import { EditIcon, BinIcon, BuildingIcon, ActivateIcon } from './entityIcons.jsx'
import { IconButton } from './IconButton.jsx'

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
// the idea kind's — ~360 lines of TradeIdeas.scss key off it, and renaming is a cosmetic pass with
// real regression surface, worth doing on its own. (MonitorDashboard.scss used to be the other
// claimant; that component was never mounted and was deleted 2026-08-19.)

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

/**
 * The ticker. Clicking it opens the chart, never the card (see isPassthroughClick).
 *
 * THE CLICK TARGET IS THE TICKER TEXT AND NOTHING ELSE. `stopPropagation` is what makes
 * that true: every row and card this sits in is itself clickable — a card opens, a Floor
 * row expands — so without it the chart would ride along with whatever the container does.
 *
 * `className` exists because the Floor rows want the same mechanism under their own grid
 * class. They cannot have their own copy: a Floor row IS a <button> and a button cannot
 * contain a button, so the clickable ticker has to be this exact span-with-stopPropagation
 * in both places, and two copies of it would drift the first time one is fixed.
 *
 * IT DOCKS THE CHART ITSELF, through the shared chart store. The store exists for exactly
 * this — its own note names "a ticker chip, a row click" as the in-app callers — and going
 * through it is what lets a cell buried three components deep put a chart up with no
 * prop-drilling and no panel wiring.
 *
 * The alternative was tried first, which is why this paragraph is here. `onSymbolClick` was
 * threaded from the page down into every list, and at the top it pointed at
 * `const [, setChartSymbol] = useState(...)` — a setter whose state nobody reads. Every
 * call was a no-op, and a no-op looks exactly like a click that missed.
 *
 * `onSymbolClick` survives as an OVERRIDE for the callers that already pass one and mean
 * something other than "dock this chart".
 */
export function SymbolCell({ symbol, onSymbolClick, className = 'idea-card__sym' }) {
    const clickable = !!symbol
    const press = e => {
        e.stopPropagation()
        if (onSymbolClick) onSymbolClick(symbol)
        else openChart({ ticker: symbol, source: 'list' })
    }
    return (
        <span
            className={clickable ? `${className} sym--chartable` : className}
            onClick={clickable ? press : undefined}
            title={clickable ? `View ${symbol} chart` : undefined}
        >{symbol || '—'}</span>
    )
}
SymbolCell.propTypes = {
    symbol: PropTypes.string,
    onSymbolClick: PropTypes.func,
    className: PropTypes.string,
}

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

// Edit and Delete are the two icon buttons the entity surfaces name explicitly — thin meaning on
// top of the shared IconButton: which glyph, and what "unavailable" means for this action.

/**
 * Edit. `locked` means the entity can't be re-worked in its build chat any more (past entry) —
 * it greys out AND disables, so what the button looks like and what it does agree. The card body
 * still opens the pop-out. `alert` / `due` are resting-red states (missing exits, review owed).
 */
export function EditButton({ onClick, title = 'Edit in chat', alert = false, due = false, locked = false, disabled = false, size = 'md', className = '' }) {
    return (
        <IconButton
            icon={<EditIcon />}
            onClick={onClick}
            title={title}
            tone={alert ? 'alert' : due ? 'due' : 'plain'}
            size={size}
            disabled={locked || disabled}
            className={`${locked ? 'icon-btn--locked ' : ''}${className}`.trim()}
        />
    )
}
EditButton.propTypes = {
    onClick: PropTypes.func.isRequired, title: PropTypes.string,
    alert: PropTypes.bool, due: PropTypes.bool, locked: PropTypes.bool, disabled: PropTypes.bool,
    size: PropTypes.oneOf(['md', 'sm']), className: PropTypes.string,
}

/**
 * Go live. The one action here that COMMITS rather than opens something, so it is deliberately
 * plain-toned like the others (the weight belongs on the confirm step, not on a row control) and
 * the surface that renders it decides when it is offered at all.
 */
export function ActivateButton({ onClick, title = 'Activate', lockedReason = null, disabled = false, size = 'md', className = '' }) {
    return (
        <IconButton
            icon={<ActivateIcon />}
            onClick={onClick}
            title={title}
            lockedReason={lockedReason}
            disabled={disabled}
            size={size}
            className={className}
        />
    )
}
ActivateButton.propTypes = {
    onClick: PropTypes.func.isRequired, title: PropTypes.string, lockedReason: PropTypes.string,
    disabled: PropTypes.bool, size: PropTypes.oneOf(['md', 'sm']), className: PropTypes.string,
}

/**
 * Delete. `lockedReason` both disables the button and explains why — every kind has some state
 * where deleting would orphan something at the broker, and each phrases it its own way.
 */
export function DeleteButton({ onClick, title = 'Delete', lockedReason = null, disabled = false, size = 'md', className = '' }) {
    return (
        <IconButton
            icon={<BinIcon />}
            onClick={onClick}
            title={title}
            lockedReason={lockedReason}
            tone="danger"
            size={size}
            disabled={disabled}
            className={className}
        />
    )
}
DeleteButton.propTypes = {
    onClick: PropTypes.func.isRequired, title: PropTypes.string,
    lockedReason: PropTypes.string, disabled: PropTypes.bool,
    size: PropTypes.oneOf(['md', 'sm']), className: PropTypes.string,
}

export { BuildingIcon }
