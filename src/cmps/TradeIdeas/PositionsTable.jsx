import PropTypes from 'prop-types'
import { Fragment } from 'react'
import {
    formatCreatedAtFull, formatPrice, formatNum, formatPnl, formatPnlPct,
    positionPnlPct, positionWorkspace, groupPositions, summarizePositions,
} from './tradeIdea.utils.js'
import { useExpandedSet } from '../../customHooks/useExpandedSet.js'

const BROKER_LABELS = { ctrader: 'cTrader', ibkr: 'IBKR' }
const WORKSPACE_LABELS = { live: 'Live', paper: 'Paper', manual: 'Manual' }

// A position's id is only unique within its account, so a position is identified by
// broker + account + id — never by id alone (two accounts can share a positionId).
// eslint-disable-next-line react-refresh/only-export-components -- tiny key helper colocated with its only consumers
export const posKey = p => `${p.broker}:${p.accountId ?? '—'}:${p.id}`

// Live / Paper / Manual workspace chip — shared with the card renderer.
// eslint-disable-next-line react-refresh/only-export-components -- tiny presentational helper colocated with positions
export function WorkspaceBadge({ workspace }) {
    return <span className={`workspace-badge workspace-badge--${workspace}`}>{WORKSPACE_LABELS[workspace] ?? workspace}</span>
}
WorkspaceBadge.propTypes = { workspace: PropTypes.string.isRequired }

export function PositionRow({ position, closing, onClose, onEditOrders, onOpen }) {
    const pnl       = Number(position.pnl)
    const pnlClass  = isNaN(pnl) ? '' : pnl > 0 ? 'pnl--pos' : pnl < 0 ? 'pnl--neg' : ''
    const pct       = positionPnlPct(position)
    const pctClass  = pct == null ? '' : pct > 0 ? 'pnl--pos' : pct < 0 ? 'pnl--neg' : ''
    const ws        = positionWorkspace(position)
    // Broker is only meaningful for a live position — paper / manual have no broker.
    const brokerLbl = ws === 'live' ? (BROKER_LABELS[position.broker] ?? position.broker ?? '—') : '—'
    const showControls = !!(onClose || onEditOrders)

    return (
        <tr
            className={'position-row' + (onOpen ? ' position-row--clickable' : '')}
            onClick={onOpen ? () => onOpen(position) : undefined}
            title={onOpen ? 'Open this position’s idea' : undefined}
        >
            <td className="position-row__asset">{position.symbol ?? '—'}</td>
            <td className={`position-row__dir direction--${position.direction}`}>{position.direction ?? '—'}</td>
            <td className="position-row__qty">{formatNum(position.volume)}</td>
            <td className="position-row__price">{formatPrice(position.entryPrice)}</td>
            <td className="position-row__entered">{formatCreatedAtFull(position.openedAt) || '—'}</td>
            <td className="position-row__mode"><WorkspaceBadge workspace={ws} /></td>
            <td className="position-row__broker">{brokerLbl}</td>
            <td className="position-row__account">{position.accountNo ?? '—'}</td>
            <td className={`position-row__pnl ${pnlClass}`}>{formatPnl(position.pnl, position.currency)}</td>
            <td className={`position-row__pnl-pct ${pctClass}`}>{formatPnlPct(pct)}</td>
            {showControls && (
                <td className="position-row__controls">
                    {onEditOrders && (
                        <button
                            className="position-row__edit"
                            disabled={closing}
                            onClick={e => { e.stopPropagation(); onEditOrders(position) }}
                            title="Open working orders (stop / TP) for this position"
                        >
                            <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                <circle cx="3.5" cy="4"  r="1" fill="currentColor"/>
                                <circle cx="3.5" cy="8"  r="1" fill="currentColor"/>
                                <circle cx="3.5" cy="12" r="1" fill="currentColor"/>
                                <path d="M6.5 4H13.5M6.5 8H13.5M6.5 12H13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                            </svg>
                        </button>
                    )}
                    {onClose && (
                        <button
                            className="position-row__close"
                            disabled={closing}
                            onClick={e => { e.stopPropagation(); onClose(position) }}
                            title="Close this position at market"
                        >
                            {closing ? '…' : (
                                <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                </svg>
                            )}
                        </button>
                    )}
                </td>
            )}
        </tr>
    )
}

PositionRow.propTypes = {
    position:     PropTypes.object.isRequired,
    closing:      PropTypes.bool,
    onClose:      PropTypes.func,
    onEditOrders: PropTypes.func,
    onOpen:       PropTypes.func,
}

const pnlClassOf = n => n == null ? '' : n > 0 ? 'pnl--pos' : n < 0 ? 'pnl--neg' : ''

// A collapsible summary row (portfolio or account) whose cells align to the position
// columns below it: name/id + position count in the lead cell, then entered · mode ·
// broker (live only) · account · P&L $ · P&L %. `variant` drives the indent / sticky.
function PositionSummaryRow({ variant, label, summary, accountText, expanded, onToggle, showControls }) {
    const brokerLbl = summary.workspace === 'live' ? (BROKER_LABELS[summary.broker] ?? summary.broker ?? '—') : '—'
    return (
        <tr className={`position-group-row position-group-row--${variant}`} onClick={onToggle} title={expanded ? 'Collapse' : 'Expand'}>
            {/* Lead spans Asset→Avg Px so the name has room; Entered onward stays column-aligned. */}
            <td className="position-group-row__lead" colSpan={4}>
                <span className="position-group-row__caret">{expanded ? '▾' : '▸'}</span>
                <span className="position-group-row__name">{label}</span>
                <span className="position-group-row__count">· {summary.count} position{summary.count === 1 ? '' : 's'}</span>
            </td>
            <td className="position-group-row__entered">{formatCreatedAtFull(summary.enteredAt) || '—'}</td>
            <td className="position-group-row__mode"><WorkspaceBadge workspace={summary.workspace} /></td>
            <td className="position-group-row__broker">{brokerLbl}</td>
            <td className="position-group-row__account">{accountText}</td>
            <td className={`position-group-row__pnl ${pnlClassOf(summary.pnl)}`}>{summary.pnl == null ? '—' : formatPnl(summary.pnl, summary.currency)}</td>
            <td className={`position-group-row__pnl-pct ${pnlClassOf(summary.pnlPct)}`}>{formatPnlPct(summary.pnlPct)}</td>
            {showControls && <td />}
        </tr>
    )
}

PositionSummaryRow.propTypes = {
    variant:     PropTypes.oneOf(['portfolio', 'account']).isRequired,
    label:       PropTypes.string.isRequired,
    summary:     PropTypes.object.isRequired,
    accountText: PropTypes.string,
    expanded:    PropTypes.bool,
    onToggle:    PropTypes.func.isRequired,
    showControls: PropTypes.bool,
}

// The open-positions table. When `ideas` is given (the Positions tab) it groups
// positions whose idea belongs to a portfolio under a collapsible, sticky header —
// standalone / idea-less positions stay flat. Without `ideas` (the read-only trade-idea
// dialog) it renders a single flat list. When neither onClose nor onEditOrders is
// given it renders read-only (no controls column).
export function PositionsTable({ positions = [], ideas = [], closingId, onClose, onEditOrders, onOpen }) {
    const showControls = !!(onClose || onEditOrders)
    const { portfolios, loose } = groupPositions(positions, ideas)
    // Portfolios (and their per-account sub-rows) start collapsed — click to expand.
    // Account sub-rows are keyed `<portfolioId>:<accountId>` so both live in one Set.
    const { isExpanded, toggle } = useExpandedSet()

    const rowProps = position => ({
        position,
        closing:      closingId === posKey(position),
        onClose,
        onEditOrders,
        onOpen,
    })
    const rows = list => list.map(position => <PositionRow key={posKey(position)} {...rowProps(position)} />)

    return (
        <table className="positions-table">
            <thead>
                <tr>
                    <th className="col-pos-asset">Asset</th>
                    <th className="col-pos-dir">Dir</th>
                    <th className="col-pos-qty">Qty</th>
                    <th className="col-pos-price">Avg Px</th>
                    <th className="col-pos-entered">Entered</th>
                    <th className="col-pos-mode">Mode</th>
                    <th className="col-pos-broker">Broker</th>
                    <th className="col-pos-account">Account</th>
                    <th className="col-pos-pnl">P&amp;L</th>
                    <th className="col-pos-pnl-pct">P&amp;L %</th>
                    {showControls && <th className="col-pos-close" />}
                </tr>
            </thead>
            {portfolios.map(group => {
                const multiAccount = group.accounts.length > 1
                const pfSummary    = summarizePositions(group.positions)
                return (
                    <tbody className="positions-group" key={group.portfolioId}>
                        <PositionSummaryRow
                            variant="portfolio"
                            label={group.name}
                            summary={pfSummary}
                            accountText={multiAccount ? `${group.accounts.length} accts` : (pfSummary.accountNo ?? '—')}
                            expanded={isExpanded(group.portfolioId)}
                            onToggle={() => toggle(group.portfolioId)}
                            showControls={showControls}
                        />
                        {isExpanded(group.portfolioId) && (
                            multiAccount
                                ? group.accounts.map(acct => {
                                    const aKey = `${group.portfolioId}:${acct.accountId ?? '—'}`
                                    const acctNo = acct.accountNo ?? acct.accountId ?? '—'
                                    return (
                                        <Fragment key={aKey}>
                                            <PositionSummaryRow
                                                variant="account"
                                                label={`Account ${acctNo}`}
                                                summary={summarizePositions(acct.positions)}
                                                accountText={String(acctNo)}
                                                expanded={isExpanded(aKey)}
                                                onToggle={() => toggle(aKey)}
                                                showControls={showControls}
                                            />
                                            {isExpanded(aKey) && rows(acct.positions)}
                                        </Fragment>
                                    )
                                })
                                : rows(group.positions)
                        )}
                    </tbody>
                )
            })}
            <tbody>
                {rows(loose)}
            </tbody>
        </table>
    )
}

PositionsTable.propTypes = {
    positions:    PropTypes.array,
    ideas:        PropTypes.array,
    closingId:    PropTypes.string,
    onClose:      PropTypes.func,
    onEditOrders: PropTypes.func,
    onOpen:       PropTypes.func,
}
