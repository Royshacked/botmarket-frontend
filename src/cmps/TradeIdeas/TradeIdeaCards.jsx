import PropTypes from 'prop-types'
import { useState } from 'react'
import {
    conditionSummary, formatCreatedAt, formatCreatedAtFull, needsExitConditions,
    activationStatus, brokerSymbolLabel, brokerChildLabel, isDeleteLocked, isManualIdea,
    isSystemStatus, formatPnl, formatPnlPct, formatNum, formatPrice, portfolioPnl, ideaPnl,
    positionPnlPct, positionWorkspace, groupPositions, summarizePositions,
} from './tradeIdea.utils.js'
import { ActivatePortfolioDialog } from './ActivatePortfolioDialog.jsx'
import { eventBus, MANUAL_PORTFOLIO_ACTIVATE, MANUAL_PORTFOLIO_EXIT } from '../../services/event-bus.service'
import { posKey, WorkspaceBadge } from './PositionsTable.jsx'
import { useExpandedSet } from '../../customHooks/useExpandedSet.js'
import { StatusIcon } from '../StatusIcon.jsx'
import { MinosBadge, AtlasBadge } from '../AxlHub/AgentBadges.jsx'

const BROKER_LABELS = { ctrader: 'cTrader', ibkr: 'IBKR' }

// Card layout for the Axl Lists Ideas tab (design trial 'cards'). Full parity with
// the table's TradeIdeaRow / BrokerGroupRow: same lifecycle colours, status toggle,
// broker badge, ⚠ no-account, ⏳ await-market, building pulse, edit + delete — just
// stacked cards instead of table rows. Reuses the same utils so the two renders stay
// in lockstep.

const BUILDING = 'building'

// ── Shared inline icons (match the app's monoline SVG set) ─────────────────────

export function EditIcon() {
    return (
        <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M11.5 1.5L14.5 4.5L5.5 13.5H2.5V10.5L11.5 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
            <path d="M9.5 3.5L12.5 6.5" stroke="currentColor" strokeWidth="1.4"/>
        </svg>
    )
}

export function BinIcon() {
    return (
        <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M2.5 4H13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            <path d="M6.5 4V2.8C6.5 2.36 6.86 2 7.3 2H8.7C9.14 2 9.5 2.36 9.5 2.8V4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            <path d="M3.7 4L4.3 13C4.34 13.56 4.8 14 5.36 14H10.64C11.2 14 11.66 13.56 11.7 13L12.3 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M6.5 6.5V11.5M9.5 6.5V11.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
    )
}

function BuildingIcon() {
    return (
        <svg className="idea-card__building-bot" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            {/* hammer — building in progress */}
            <path d="m15 12-8.373 8.373a1 1 0 1 1-3-3L12 9"/>
            <path d="m18 15 4-4"/>
            <path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586z"/>
        </svg>
    )
}

function TargetIcon() {
    return (
        <svg className="idea-card__target" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="8" cy="8" r="6"/>
            <circle cx="8" cy="8" r="2.4"/>
        </svg>
    )
}

function PositionIcon() {
    // Live-position mark — a price pulse line.
    return (
        <svg className="idea-card__icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M3 13h3l2.5-6 3.5 12 2.5-9 2 3h4.5"/>
        </svg>
    )
}

function OrdersIcon() {
    return (
        <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="3.5" cy="4"  r="1" fill="currentColor"/>
            <circle cx="3.5" cy="8"  r="1" fill="currentColor"/>
            <circle cx="3.5" cy="12" r="1" fill="currentColor"/>
            <path d="M6.5 4H13.5M6.5 8H13.5M6.5 12H13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
    )
}

function CloseIcon() {
    return (
        <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
    )
}

// ── Single idea card ───────────────────────────────────────────────────────────

export function IdeaCard({ idea, onDelete, onStatusChange, onOpen, onSymbolClick, onEdit, isBrokerChild, showPnl = false, pnl = null }) {
    const { id, asset, direction, type, status, savedAt } = idea
    const summary    = conditionSummary(idea)
    const createdAt  = formatCreatedAt(savedAt)
    const needsExits = needsExitConditions(idea)
    const brokerSym  = brokerSymbolLabel(idea)
    const isBuilding = status === BUILDING
    const deleteLocked = isDeleteLocked(idea)

    // Leaf idea with no broker account → alert-only (no order plan / confirm dialog).
    // Broker-child forks are per-account by definition; closed/building are moot.
    const noAccount = !isBrokerChild && !isBuilding && status !== 'closed' &&
        (!Array.isArray(idea.accounts) || idea.accounts.length === 0)

    function handleCardClick(ev) {
        if (isBuilding) return
        if (ev.target.closest('.idea-card__controls')) return
        onOpen(idea)
    }

    return (
        <article
            className={`idea-card idea-card--${status}${isBrokerChild ? ' idea-card--broker-child' : ''}`}
            onClick={handleCardClick}
        >
            <div className="idea-card__icon" aria-hidden="true"><MinosBadge size={42} /></div>

            <div className="idea-card__body">
                <div className="idea-card__titleline">
                    {isBrokerChild ? (
                        <span className="idea-card__broker">{brokerChildLabel(idea)}</span>
                    ) : (
                        <span
                            className="idea-card__sym"
                            onClick={e => { e.stopPropagation(); if (asset && onSymbolClick) onSymbolClick(asset) }}
                            title={asset ? `View ${asset} chart` : undefined}
                            style={{ cursor: asset ? 'pointer' : 'default' }}
                        >{asset || '—'}</span>
                    )}
                    {direction && (
                        <span className={`idea-card__pill idea-card__pill--dir direction--${direction}`}>{direction}</span>
                    )}
                    {type && <span className="idea-card__pill idea-card__pill--type">{type}</span>}
                    {!isBrokerChild && brokerSym && (
                        <span className="idea-card__broker-badge" title={`Trades as ${brokerSym} on the broker`}>{brokerSym}</span>
                    )}
                    {noAccount && (
                        <span className="idea-card__no-account" title="No broker account attached — this idea will alert only (no order placed). Edit to attach an account.">⚠</span>
                    )}
                    {showPnl && pnl && (
                        <span className={`idea-card__pnl${pnl.pnl > 0 ? ' pnl--pos' : pnl.pnl < 0 ? ' pnl--neg' : ''}`}>
                            {formatPnl(pnl.pnl, pnl.currency)}
                        </span>
                    )}
                </div>
                <div className="idea-card__summary">
                    <TargetIcon />
                    <span className="idea-card__summary-text">{summary || '—'}</span>
                    <span className="idea-card__date" title={formatCreatedAtFull(savedAt)}> · {createdAt || '—'}</span>
                </div>
            </div>

            <div className="idea-card__controls">
                {idea.orderState === 'awaiting_market' && (
                    <span className="idea-card__await-market" title="Order deferred until the market opens">⏳</span>
                )}

                {isBuilding ? (
                    <BuildingIcon />
                ) : isSystemStatus(status) ? (
                    <span className={`idea-card__status-badge status--${status}`}>
                        <StatusIcon status={status} />
                    </span>
                ) : (
                    <button
                        className={`idea-card__status-toggle status--${status}`}
                        onClick={e => { e.stopPropagation(); onStatusChange(id, status === 'waiting' ? activationStatus(idea) : 'waiting') }}
                        title={status === 'waiting' ? `Activate (→ ${activationStatus(idea)})`
                            : status === 'resting' ? 'Cancel resting order (→ waiting)'
                            : 'Switch to waiting'}
                    >
                        <StatusIcon status={status} />
                    </button>
                )}

                {!isBuilding && onEdit && (
                    <button
                        className={`idea-card__edit-btn${needsExits ? ' idea-card__edit-btn--alert' : ''}`}
                        onClick={e => { e.stopPropagation(); onEdit(idea) }}
                        title={needsExits ? 'Missing stop / take profit — click to add' : 'Edit in chat'}
                    ><EditIcon /></button>
                )}
                {!isBuilding && onDelete && (
                    <button
                        className="idea-card__delete"
                        onClick={e => { e.stopPropagation(); if (!deleteLocked) onDelete(id) }}
                        disabled={deleteLocked}
                        title={deleteLocked ? 'Live on the broker — close the position first to delete' : 'Delete idea'}
                    ><BinIcon /></button>
                )}
            </div>
        </article>
    )
}

IdeaCard.propTypes = {
    idea:           PropTypes.object.isRequired,
    onDelete:       PropTypes.func,
    onStatusChange: PropTypes.func.isRequired,
    onOpen:         PropTypes.func.isRequired,
    onSymbolClick:  PropTypes.func,
    onEdit:         PropTypes.func,
    isBrokerChild:  PropTypes.bool,
    showPnl:        PropTypes.bool,
    pnl:            PropTypes.object,
}

// ── Multi-broker fork: one group card, expandable to per-broker child cards ────

export function BrokerGroupCard({ group, expanded, onToggle, onDelete, onStatusChange, onOpen, onSymbolClick }) {
    const lead       = group.ideas[0]
    const asset      = lead?.asset
    const brokerSym  = brokerSymbolLabel(lead)
    const summary    = conditionSummary(lead)
    const allWaiting = group.ideas.every(i => i.status === 'waiting')
    // Any leg live on the broker → block the group delete (would orphan a position).
    const anyLocked  = group.ideas.some(isDeleteLocked)

    function handleActivateAll(e) {
        e.stopPropagation()
        group.ideas.forEach(idea => { if (idea.status === 'waiting') onStatusChange(idea.id, activationStatus(idea)) })
    }
    function handleDeleteAll(e) {
        e.stopPropagation()
        if (anyLocked) return
        group.ideas.forEach(idea => onDelete(idea.id))
    }

    return (
        <div className="idea-card-group">
            <article className="idea-card idea-card--group" onClick={onToggle}>
                <div className="idea-card__icon idea-card__icon--group" aria-hidden="true">
                    <span className="idea-card__caret">{expanded ? '▾' : '▸'}</span>
                </div>

                <div className="idea-card__body">
                    <div className="idea-card__titleline">
                        <span
                            className="idea-card__sym"
                            onClick={e => { e.stopPropagation(); if (asset && onSymbolClick) onSymbolClick(asset) }}
                            style={{ cursor: asset ? 'pointer' : 'default' }}
                            title={asset ? `View ${asset} chart` : undefined}
                        >{asset || '—'}</span>
                        {lead?.direction && (
                            <span className={`idea-card__pill idea-card__pill--dir direction--${lead.direction}`}>{lead.direction}</span>
                        )}
                        {brokerSym && <span className="idea-card__broker-badge">{brokerSym}</span>}
                        <span className="idea-card__broker-count" title={`${group.ideas.length} brokers`}>⑂{group.ideas.length}</span>
                    </div>
                    <div className="idea-card__summary">
                        <TargetIcon />
                        <span className="idea-card__summary-text">{summary || '—'}</span>
                        <span className="idea-card__date"> · {formatCreatedAt(group.savedAt) || '—'}</span>
                    </div>
                </div>

                <div className="idea-card__controls">
                    {allWaiting ? (
                        <button className="idea-card__status-toggle status--waiting" onClick={handleActivateAll} title="Activate all broker legs">
                            <StatusIcon status="waiting" />
                        </button>
                    ) : (
                        <span className="idea-card__status-badge idea-card__status-badge--group" title="Expand to manage each broker">active</span>
                    )}
                    <button
                        className="idea-card__delete"
                        onClick={handleDeleteAll}
                        disabled={anyLocked}
                        title={anyLocked ? 'A broker leg is live — close the position first to delete' : 'Delete all broker legs of this idea'}
                    ><BinIcon /></button>
                </div>
            </article>

            {expanded && (
                <div className="idea-card-group__children">
                    {group.ideas.map(idea => (
                        <IdeaCard
                            key={idea.id}
                            idea={idea}
                            onDelete={onDelete}
                            onStatusChange={onStatusChange}
                            onOpen={onOpen}
                            onSymbolClick={onSymbolClick}
                            isBrokerChild
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

BrokerGroupCard.propTypes = {
    group:          PropTypes.object.isRequired,
    expanded:       PropTypes.bool,
    onToggle:       PropTypes.func.isRequired,
    onDelete:       PropTypes.func.isRequired,
    onStatusChange: PropTypes.func.isRequired,
    onOpen:         PropTypes.func.isRequired,
    onSymbolClick:  PropTypes.func,
}

// ── Portfolio P&L pill (▵ gain / ▽ loss) ───────────────────────────────────────

function PnlPill({ pnl }) {
    if (!pnl) return <span className="idea-card__pnl-pill idea-card__pnl-pill--flat">—</span>
    const cls = pnl.pnl > 0 ? ' pnl--pos' : pnl.pnl < 0 ? ' pnl--neg' : ' idea-card__pnl-pill--flat'
    const arrow = pnl.pnl > 0 ? '△' : pnl.pnl < 0 ? '▽' : ''
    return (
        <span className={`idea-card__pnl-pill${cls}`} title="Live unrealized P&L across this portfolio's open positions">
            {arrow && <span className="idea-card__pnl-arrow">{arrow}</span>}{formatPnl(pnl.pnl, pnl.currency)}
        </span>
    )
}

PnlPill.propTypes = { pnl: PropTypes.object }

// ── Portfolio card (Portfolios tab), expandable to per-idea child cards ────────

export function PortfolioCard({ group, expanded, onToggle, onEdit, onDelete, onDeletePortfolio, onStatusChange, onOpen, onSymbolClick, positions = [], isReviewDue = false }) {
    const [showActivatePrompt, setShowActivatePrompt] = useState(false)
    const allWaiting = group.ideas.length > 0 && group.ideas.every(i => i.status === 'waiting')
    const isManual   = group.ideas.length > 0 && group.ideas.every(isManualIdea)
    const anyOpen    = group.ideas.some(i => i.status === 'long' || i.status === 'short')
    const pnl        = portfolioPnl(group.ideas, positions)
    // Any idea live on the broker → block the whole-portfolio delete (would orphan
    // the live position + delete the chat). Close it first.
    const anyLocked  = group.ideas.some(isDeleteLocked)

    function handleActivateAll(e) {
        e.stopPropagation()
        // Pre-activation gate: portfolio ideas are naked / immediate entries, so
        // activating fires them all at market at once — offer a final Atlas review
        // first (parity with the table's PortfolioGroupRow / ActivatePortfolioDialog).
        setShowActivatePrompt(true)
    }
    function activateNow() {
        setShowActivatePrompt(false)
        // Manual: post the N-leg entry FillCard instead of flipping statuses.
        if (isManual) { eventBus.emit(MANUAL_PORTFOLIO_ACTIVATE, { portfolioId: group.portfolioId }); return }
        group.ideas.forEach(idea => { if (idea.status === 'waiting') onStatusChange(idea.id, activationStatus(idea)) })
    }
    function reviewBeforeActivate() {
        // Open the portfolio in the Atlas chat in review mode; handleEditPortfolio
        // resets ideas to 'waiting' so the book stays pending until re-activated.
        setShowActivatePrompt(false)
        onEdit(group.portfolioId, { reviewMode: true })
    }
    function handleDeactivateAll(e) {
        e.stopPropagation()
        // Manual: positions live → exit card; still awaiting fills → re-post entry card.
        if (isManual) {
            eventBus.emit(anyOpen ? MANUAL_PORTFOLIO_EXIT : MANUAL_PORTFOLIO_ACTIVATE, { portfolioId: group.portfolioId })
            return
        }
        group.ideas.forEach(idea => { if (idea.status !== 'waiting') onStatusChange(idea.id, 'waiting') })
    }
    function handleDeleteAll(e) {
        e.stopPropagation()
        if (anyLocked) return
        onDeletePortfolio(group.portfolioId)
    }

    return (
        <div className="idea-card-group">
            <article className="idea-card idea-card--portfolio" onClick={onToggle}>
                <span className="idea-card__caret idea-card__caret--lead">{expanded ? '▾' : '▸'}</span>
                <div className="idea-card__icon idea-card__icon--portfolio" aria-hidden="true">
                    <AtlasBadge size={42} />
                </div>

                <div className="idea-card__body">
                    <div className="idea-card__titleline">
                        <span className="idea-card__pf-name">{group.name}</span>
                    </div>
                    <div className="idea-card__summary">
                        <span className="idea-card__summary-text">{group.ideas.length} asset{group.ideas.length === 1 ? '' : 's'}</span>
                        <span className="idea-card__date"> · Created {formatCreatedAt(group.savedAt) || '—'}</span>
                    </div>
                </div>

                <div className="idea-card__controls">
                    <PnlPill pnl={pnl} />
                    {allWaiting ? (
                        <button className="idea-card__status-toggle status--waiting" onClick={handleActivateAll} title="Activate all ideas in this portfolio">
                            <StatusIcon status="waiting" />
                        </button>
                    ) : (
                        <button className="idea-card__status-badge idea-card__status-badge--group" onClick={handleDeactivateAll} title={isManual ? (anyOpen ? 'Record your exit — enter your exit prices in social chat' : 'Re-post the entry card in social chat') : 'Set all ideas in this portfolio back to waiting'}>
                            {isManual ? (anyOpen ? 'exit' : 'fill') : 'active'}
                        </button>
                    )}
                    <button
                        className={`idea-card__edit-btn${isReviewDue ? ' idea-card__edit-btn--due' : ''}`}
                        onClick={e => { e.stopPropagation(); onEdit(group.portfolioId, isReviewDue ? { reviewMode: true } : undefined) }}
                        title={isReviewDue ? 'Review due — open review in chat' : 'Edit portfolio in chat'}
                    ><EditIcon /></button>
                    <button
                        className="idea-card__delete"
                        onClick={handleDeleteAll}
                        disabled={anyLocked}
                        title={anyLocked ? 'A position is live — close it first to delete this portfolio' : 'Delete all ideas in this portfolio'}
                    ><BinIcon /></button>
                </div>
            </article>

            {expanded && (
                <div className="idea-card-group__children">
                    {group.ideas.map(idea => (
                        <IdeaCard
                            key={idea.id}
                            idea={idea}
                            onDelete={onDelete}
                            onStatusChange={onStatusChange}
                            onOpen={onOpen}
                            onSymbolClick={onSymbolClick}
                            showPnl
                            pnl={ideaPnl(idea, positions)}
                        />
                    ))}
                </div>
            )}
            {showActivatePrompt && (
                <ActivatePortfolioDialog
                    name={group.name}
                    count={group.ideas.length}
                    manual={isManual}
                    onReview={reviewBeforeActivate}
                    onActivate={activateNow}
                    onClose={() => setShowActivatePrompt(false)}
                />
            )}
        </div>
    )
}

PortfolioCard.propTypes = {
    group:            PropTypes.object.isRequired,
    expanded:         PropTypes.bool,
    onToggle:         PropTypes.func.isRequired,
    onEdit:           PropTypes.func.isRequired,
    onDelete:         PropTypes.func.isRequired,
    onDeletePortfolio: PropTypes.func.isRequired,
    onStatusChange:   PropTypes.func.isRequired,
    onOpen:           PropTypes.func.isRequired,
    onSymbolClick:    PropTypes.func,
    positions:        PropTypes.array,
}

// ── Building (in-chat) portfolio card ──────────────────────────────────────────

export function BuildingPortfolioCard({ portfolio }) {
    return (
        <article className="idea-card idea-card--portfolio idea-card--building">
            <span className="idea-card__caret idea-card__caret--lead" aria-hidden="true" />
            <div className="idea-card__icon idea-card__icon--portfolio" aria-hidden="true"><AtlasBadge size={42} /></div>
            <div className="idea-card__body">
                <div className="idea-card__titleline">
                    <span className="idea-card__pf-name">{portfolio.name}</span>
                </div>
                <div className="idea-card__summary">
                    <span className="idea-card__summary-text">{portfolio.ideasCount} asset{portfolio.ideasCount === 1 ? '' : 's'}</span>
                </div>
            </div>
            <div className="idea-card__controls"><BuildingIcon /></div>
        </article>
    )
}

BuildingPortfolioCard.propTypes = { portfolio: PropTypes.object.isRequired }

// ── Position card (Positions tab) ──────────────────────────────────────────────

export function PositionCard({ position, closing, onClose, onEditOrders, onOpen }) {
    const dir       = position.direction
    const ws        = positionWorkspace(position)
    // Broker only carries meaning for a live position (paper / manual have none).
    const brokerLbl = ws === 'live' ? (BROKER_LABELS[position.broker] ?? position.broker ?? '—') : null
    const pct       = positionPnlPct(position)

    function handleCardClick(ev) {
        if (ev.target.closest('.idea-card__controls')) return
        if (onOpen) onOpen(position)
    }

    return (
        <article
            className={`idea-card idea-card--position${onOpen ? '' : ' idea-card--static'}`}
            onClick={handleCardClick}
            title={onOpen ? 'Open this position’s idea' : undefined}
        >
            <div className={`idea-card__icon idea-card__icon--pos direction--${dir}`} aria-hidden="true"><PositionIcon /></div>

            <div className="idea-card__body">
                <div className="idea-card__titleline">
                    <span className="idea-card__sym">{position.symbol ?? '—'}</span>
                    {dir && <span className={`idea-card__pill idea-card__pill--dir direction--${dir}`}>{dir}</span>}
                    <WorkspaceBadge workspace={ws} />
                    {brokerLbl && <span className="idea-card__broker-badge">{brokerLbl}</span>}
                    {position.accountNo && <span className="idea-card__broker-count">{position.accountNo}</span>}
                </div>
                <div className="idea-card__summary">
                    <span className="idea-card__summary-text">{formatNum(position.volume)} @ {formatPrice(position.entryPrice)}</span>
                    <span className="idea-card__date"> · Entered {formatCreatedAtFull(position.openedAt) || '—'}</span>
                </div>
            </div>

            <div className="idea-card__controls">
                <PnlStack pnl={position.pnl == null ? null : Number(position.pnl)} currency={position.currency} pct={pct} />
                {onEditOrders && (
                    <button
                        className="idea-card__edit-btn"
                        disabled={closing}
                        onClick={e => { e.stopPropagation(); onEditOrders(position) }}
                        title="Open working orders (stop / TP) for this position"
                    ><OrdersIcon /></button>
                )}
                {onClose && (
                    <button
                        className="idea-card__delete"
                        disabled={closing}
                        onClick={e => { e.stopPropagation(); onClose(position) }}
                        title="Close this position at market"
                    >{closing ? <span className="idea-card__closing">…</span> : <CloseIcon />}</button>
                )}
            </div>
        </article>
    )
}

PositionCard.propTypes = {
    position:     PropTypes.object.isRequired,
    closing:      PropTypes.bool,
    onClose:      PropTypes.func,
    onEditOrders: PropTypes.func,
    onOpen:       PropTypes.func,
}

// Money P&L pill stacked over the price-move % — used on position cards and group headers.
function PnlStack({ pnl, currency, pct }) {
    const pctClass = pct == null ? ' idea-card__pnl-pct--flat' : pct > 0 ? ' pnl--pos' : pct < 0 ? ' pnl--neg' : ' idea-card__pnl-pct--flat'
    return (
        <span className="idea-card__pnl-stack">
            <PnlPill pnl={pnl == null ? null : { pnl, currency }} />
            <span className={`idea-card__pnl-pct${pctClass}`}>{formatPnlPct(pct)}</span>
        </span>
    )
}
PnlStack.propTypes = { pnl: PropTypes.number, currency: PropTypes.string, pct: PropTypes.number }

// Collapsible summary header card (portfolio or account) — mirrors PortfolioCard's shape
// with the aggregate fields the positions view shows: mode · broker (live) · account ·
// N positions · entered · P&L $ / %. Only the portfolio variant is sticky (via the
// `idea-card--portfolio` class the group's sticky rule targets).
function GroupSummaryHeader({ variant, icon, title, accountText, summary, expanded, onToggle }) {
    const brokerLbl = summary.workspace === 'live' ? (BROKER_LABELS[summary.broker] ?? summary.broker ?? null) : null
    const sticky    = variant === 'portfolio' ? ' idea-card--portfolio' : ''
    return (
        <article className={`idea-card idea-card--position-group idea-card--${variant}-group${sticky}`} onClick={onToggle}>
            <span className="idea-card__caret idea-card__caret--lead">{expanded ? '▾' : '▸'}</span>
            {icon}
            <div className="idea-card__body">
                <div className="idea-card__titleline">
                    <span className="idea-card__pf-name">{title}</span>
                    <WorkspaceBadge workspace={summary.workspace} />
                    {brokerLbl && <span className="idea-card__broker-badge">{brokerLbl}</span>}
                    {accountText && <span className="idea-card__broker-count">{accountText}</span>}
                </div>
                <div className="idea-card__summary">
                    <span className="idea-card__summary-text">{summary.count} position{summary.count === 1 ? '' : 's'}</span>
                    <span className="idea-card__date"> · Entered {formatCreatedAtFull(summary.enteredAt) || '—'}</span>
                </div>
            </div>
            <div className="idea-card__controls">
                <PnlStack pnl={summary.pnl} currency={summary.currency} pct={summary.pnlPct} />
            </div>
        </article>
    )
}
GroupSummaryHeader.propTypes = {
    variant:     PropTypes.oneOf(['portfolio', 'account']).isRequired,
    icon:        PropTypes.node,
    title:       PropTypes.string.isRequired,
    accountText: PropTypes.string,
    summary:     PropTypes.object.isRequired,
    expanded:    PropTypes.bool,
    onToggle:    PropTypes.func.isRequired,
}

// A portfolio's positions under one collapsible header card. When it spans several
// accounts, its positions nest under a collapsible per-account sub-card; a single-account
// portfolio lists its position cards directly. Collapse state (portfolio + `pfId:acctId`
// account keys) is shared via the parent's expanded set.
function PositionPortfolioGroup({ group, isExpanded, toggle, closingId, onClose, onEditOrders, onOpen }) {
    const multiAccount = group.accounts.length > 1
    const pfSummary    = summarizePositions(group.positions)
    const card = position => (
        <PositionCard
            key={posKey(position)}
            position={position}
            closing={closingId === posKey(position)}
            onClose={onClose}
            onEditOrders={onEditOrders}
            onOpen={onOpen}
        />
    )

    return (
        <div className="idea-card-group idea-card-group--positions">
            <GroupSummaryHeader
                variant="portfolio"
                icon={<div className="idea-card__icon idea-card__icon--portfolio" aria-hidden="true"><AtlasBadge size={42} /></div>}
                title={group.name}
                accountText={multiAccount ? `${group.accounts.length} accts` : (pfSummary.accountNo ?? null)}
                summary={pfSummary}
                expanded={isExpanded(group.portfolioId)}
                onToggle={() => toggle(group.portfolioId)}
            />
            {isExpanded(group.portfolioId) && (
                <div className="idea-card-group__children">
                    {multiAccount
                        ? group.accounts.map(acct => {
                            const aKey   = `${group.portfolioId}:${acct.accountId ?? '—'}`
                            const acctNo = acct.accountNo ?? acct.accountId ?? '—'
                            return (
                                <div className="idea-card-group idea-card-group--account" key={aKey}>
                                    <GroupSummaryHeader
                                        variant="account"
                                        title={`Account ${acctNo}`}
                                        summary={summarizePositions(acct.positions)}
                                        expanded={isExpanded(aKey)}
                                        onToggle={() => toggle(aKey)}
                                    />
                                    {isExpanded(aKey) && (
                                        <div className="idea-card-group__children">{acct.positions.map(card)}</div>
                                    )}
                                </div>
                            )
                        })
                        : group.positions.map(card)}
                </div>
            )}
        </div>
    )
}

PositionPortfolioGroup.propTypes = {
    group:        PropTypes.object.isRequired,
    isExpanded:   PropTypes.func.isRequired,
    toggle:       PropTypes.func.isRequired,
    closingId:    PropTypes.string,
    onClose:      PropTypes.func,
    onEditOrders: PropTypes.func,
    onOpen:       PropTypes.func,
}

// Positions tab (card design). With `ideas`, positions whose idea belongs to a
// portfolio collapse under a PositionPortfolioGroup; everything else renders as a
// flat card. Without `ideas` (the idea pop-out footer) every position is flat.
export function PositionsCards({ positions = [], ideas = [], closingId, onClose, onEditOrders, onOpen }) {
    const { portfolios, loose } = groupPositions(positions, ideas)
    // Portfolios start collapsed (spec: a portfolio shows collapsed, click to expand).
    const { isExpanded, toggle } = useExpandedSet()

    return (
        <div className="ideas-cards">
            {portfolios.map(group => (
                <PositionPortfolioGroup
                    key={group.portfolioId}
                    group={group}
                    isExpanded={isExpanded}
                    toggle={toggle}
                    closingId={closingId}
                    onClose={onClose}
                    onEditOrders={onEditOrders}
                    onOpen={onOpen}
                />
            ))}
            {loose.map(position => (
                <PositionCard
                    key={posKey(position)}
                    position={position}
                    closing={closingId === posKey(position)}
                    onClose={onClose}
                    onEditOrders={onEditOrders}
                    onOpen={onOpen}
                />
            ))}
        </div>
    )
}

PositionsCards.propTypes = {
    positions:    PropTypes.array,
    ideas:        PropTypes.array,
    closingId:    PropTypes.string,
    onClose:      PropTypes.func,
    onEditOrders: PropTypes.func,
    onOpen:       PropTypes.func,
}
