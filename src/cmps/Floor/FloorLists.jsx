import { useState } from 'react'
import PropTypes from 'prop-types'
import { groupByLifecycle, isPreEntry, isLivePosition } from '../../services/entityStatus.js'
import {
    openCallPopup, openSetupPopup, openIdeaPopup,
    portfoliosFromIdeas, portfolioPnl, formatPnl, isDeleteLocked,
} from '../TradeIdeas/tradeIdea.utils.js'
import { EditButton, DeleteButton } from '../EntityCard/EntityCard.jsx'
import { tradeFloorItems } from './floor.utils.js'
import { CoverageActions } from '../Radar/CoverageActions.jsx'
import './Floor.scss'

// The Floor's right column: four desks, one open at a time.
//
// Every row is ONE LINE and carries only what you'd scan for — never the whole entity. Anything
// more is a click away in the pop-out that kind already has (entityPopup.js), which is why there
// are no cards here: a card exists to hold a summary you can't fit on a line, and once the detail
// lives in a window there is nothing left for it to hold.
//
// The desks differ in WHAT they list; the shell — header, count, open/close, empty state — is the
// same for all four, so it lives once in <Desk> and each desk supplies only its rows.

const DESKS = [
    { key: 'trade',     label: 'Trading floor' },
    { key: 'portfolio', label: 'Portfolio floor' },
    { key: 'scans',     label: 'Scans' },
    { key: 'coverage',  label: 'Coverage' },
]

function openFor(item) {
    if (item.kind === 'call')  return openCallPopup(item.entity)
    if (item.kind === 'setup') return openSetupPopup(item.entity)
    return openIdeaPopup(item.entity)
}

function Desk({ desk, open, count, onToggle, children }) {
    return (
        <section className={`floor-desk${open ? ' floor-desk--open' : ''}`}>
            <button
                className="floor-desk__head"
                onClick={() => onToggle(desk.key)}
                aria-expanded={open}
            >
                <svg className="floor-desk__chev" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="floor-desk__label">{desk.label}</span>
                {/* Parenthesised and next to the label, not parked on the right edge: the count is
                    part of what the desk IS ("Scans (3)"), not a separate column to scan down. */}
                {count > 0 && <span className="floor-desk__count">({count})</span>}
            </button>
            {open && <div className="floor-desk__body">{children}</div>}
        </section>
    )
}
Desk.propTypes = {
    desk:     PropTypes.object.isRequired,
    open:     PropTypes.bool,
    count:    PropTypes.number,
    onToggle: PropTypes.func.isRequired,
    children: PropTypes.node,
}

const Empty = ({ children }) => <p className="floor-empty">{children}</p>
Empty.propTypes = { children: PropTypes.node }

// ── The row shell that carries actions ────────────────────────────────────────
//
// A row IS a <button> and a button cannot contain a button, so edit/delete ride in a SIBLING
// overlay pinned to the row's right edge rather than as two more cells inside it. That also keeps
// the row grid — which every desk shares — exactly as it was: nothing shifts when the controls
// appear, because they were never in the flow.
//
// Reveal is on hover OR focus-within (see Floor.scss): hover alone would strand the buttons for
// the keyboard, since they live inside the very row you have to reach to show them.
//
// Same split as everywhere else in the app — the shell is shared, the JUDGMENT isn't. WHICH
// actions a row offers, what they're called, and when they lock stays with the desk that owns
// the entity, because only that desk knows what deleting one of its rows would orphan.
function RowHost({ actions, children }) {
    return (
        <div className="floor-rowhost">
            {children}
            {actions && <span className="floor-rowhost__actions">{actions}</span>}
        </div>
    )
}
RowHost.propTypes = { actions: PropTypes.node, children: PropTypes.node }

// ── Trading floor ─────────────────────────────────────────────────────────────

// The two kinds keep their own action contracts — the same ones CallCard and SetupCard use, so a
// call and a setup behave identically whether you reach them from a card or from this line:
//
//  · the pencil returns the entity to the chat that BUILT it (Kairos / Mentor), and only while the
//    trade is pre-entry — once a position is live, changes go through management cards, not a
//    re-run of the build conversation;
//  · the bin locks while a position is live — deleting would leave that position open at the
//    broker with nothing left describing it, so no monitor manages its stop. The server refuses
//    it (409 reason:'in_position') for every kind; don't render an action that can only fail.
function callActions(call, onEdit, onDelete) {
    if (!onEdit && !onDelete) return null
    return (
        <>
            {onEdit && isPreEntry(call.status) && (
                <EditButton onClick={() => onEdit(call)} title="Edit call in Kairos chat" size="sm" />
            )}
            {onDelete && (
                <DeleteButton
                    onClick={() => onDelete(call.id)}
                    title="Delete call"
                    lockedReason={isLivePosition(call.status) ? 'In a live position — close it at the broker first' : null}
                    size="sm"
                />
            )}
        </>
    )
}

function setupActions(setup, onEdit, onDelete) {
    if (!onEdit && !onDelete) return null
    return (
        <>
            {onEdit && isPreEntry(setup.status ?? 'waiting') && (
                <EditButton onClick={() => onEdit(setup)} title="Edit setup in Mentor chat" size="sm" />
            )}
            {onDelete && (
                <DeleteButton
                    onClick={() => onDelete(setup)}
                    title="Delete setup"
                    lockedReason={isLivePosition(setup.status) ? 'In a live position — close it at the broker first' : null}
                    size="sm"
                />
            )}
        </>
    )
}

function TradeRows({ calls, setups, onEditCall, onDeleteCall, onEditSetup, onDeleteSetup }) {
    const items = tradeFloorItems(calls, setups)
    if (!items.length) return <Empty>No calls or setups.</Empty>

    const actionsFor = it => (it.kind === 'call'
        ? callActions(it.entity, onEditCall, onDeleteCall)
        : setupActions(it.entity, onEditSetup, onDeleteSetup))

    return groupByLifecycle(items).map(group => (
        <div key={group.key} className="floor-grp">
            <div className={`floor-grp__label floor-grp__label--${group.key}`}>{group.label}</div>
            {group.items.map(it => (
                <RowHost key={`${it.kind}:${it.id}`} actions={actionsFor(it)}>
                    <button
                        className="floor-row"
                        onClick={() => openFor(it)}
                        title={`Open this ${it.kind}`}
                    >
                        <span className={`floor-row__dir floor-row__dir--${it.direction}`} aria-hidden="true">
                            {it.direction === 'short' ? '▾' : '▴'}
                        </span>
                        <span className="floor-row__sym">{it.ticker ?? '—'}</span>
                        <span className="floor-row__kind">{it.kind}</span>
                        <span className={`floor-row__status floor-row__status--${it.status}`}>{it.status}</span>
                    </button>
                </RowHost>
            ))}
        </div>
    ))
}
TradeRows.propTypes = {
    calls:         PropTypes.array,
    setups:        PropTypes.array,
    onEditCall:    PropTypes.func,
    onDeleteCall:  PropTypes.func,
    onEditSetup:   PropTypes.func,
    onDeleteSetup: PropTypes.func,
}

// ── Portfolio floor ───────────────────────────────────────────────────────────

// A portfolio has no record of its own — there is no `portfolios` collection. It IS the set of
// ideas sharing a `portfolioId` (saveBatchIdeas stamps them), which is what portfoliosFromIdeas
// reconstructs. So expanding a book shows those records; there is nothing else underneath.
//
// They're labelled HOLDINGS, not ideas. The codebase already made that move — a portfolio member
// is a `portfolio_item`, with the `_idea` spelling kept only as legacy (see MainPage's rebalance
// dialog) — and inside this desk "idea" would be leaking the storage model at the reader.
const pctOf = (ratio) => (Number.isFinite(Number(ratio)) ? `${Math.round(Number(ratio) * 100)}%` : '')

// `long` / `short` are lifecycle rungs meaning "in a live position" — they are not a second copy of
// the direction, but they are SPELLED like one, so printing them beside the direction arrow reads
// as the same fact twice. The stage is what the column is for; the arrow already says which way.
const STATUS_TEXT = { long: 'in position', short: 'in position' }
const statusText = (status) => STATUS_TEXT[status] ?? status

function PortfolioRows({ ideas, positions, onEditPortfolio, onDeletePortfolio, onDeleteIdea }) {
    const books = portfoliosFromIdeas(ideas)
    const [open, setOpen] = useState(() => new Set())
    if (!books.length) return <Empty>No portfolios.</Empty>

    const toggle = id => setOpen(prev => {
        const next = new Set(prev)
        next.has(id) ? next.delete(id) : next.add(id)
        return next
    })

    // The book's own actions, which are NOT the sum of its holdings': editing reopens the whole
    // construction in the Atlas chat, and deleting removes every leg plus the chat history. That's
    // why ONE live leg locks the bin for the entire book — the same rule the ideas table applies.
    function bookActions(b) {
        if (!onEditPortfolio && !onDeletePortfolio) return null
        const anyLocked = b.ideas.some(isDeleteLocked)
        return (
            <>
                {onEditPortfolio && (
                    <EditButton onClick={() => onEditPortfolio(b.portfolioId)} title="Edit portfolio in chat" size="sm" />
                )}
                {onDeletePortfolio && (
                    <DeleteButton
                        onClick={() => onDeletePortfolio(b.portfolioId)}
                        title="Delete all holdings in this portfolio"
                        lockedReason={anyLocked ? 'A position is live — close it first to delete this portfolio' : null}
                        size="sm"
                    />
                )}
            </>
        )
    }

    // A holding gets a bin but NO pencil, and that is a statement about the entity rather than a
    // gap: a holding exists as part of a book's construction — its weight only means something
    // against the other legs — so it is edited by reopening the BOOK in Atlas, which the row above
    // already offers. (The per-holding chat that would have edited one leg on its own is the
    // archived Idea agent; routing a pencil there would open a chat that cannot send.)
    //
    // Deleting one leg is different: it's removing a position from the book, not re-planning it,
    // and the rest of the book stands without it.
    function holdingActions(h) {
        if (!onDeleteIdea) return null
        return (
            <DeleteButton
                onClick={() => onDeleteIdea(h.id)}
                title="Delete holding"
                lockedReason={isDeleteLocked(h) ? 'In a live position — close it at the broker first' : null}
                size="sm"
            />
        )
    }

    return books.map(b => {
        const isOpen = open.has(b.portfolioId)
        const pnl    = portfolioPnl(b.ideas, positions)
        return (
            <div key={b.portfolioId} className="floor-sub">
                <RowHost actions={bookActions(b)}>
                    <button className="floor-row" onClick={() => toggle(b.portfolioId)} aria-expanded={isOpen}>
                        <span className="floor-row__sym floor-row__sym--wide">{b.name}</span>
                        <span className="floor-row__kind">({b.ideas.length} holdings)</span>
                        <span className={`floor-row__pnl ${pnl?.pnl > 0 ? 'is-pos' : pnl?.pnl < 0 ? 'is-neg' : ''}`}>
                            {pnl ? formatPnl(pnl.pnl, pnl.currency) : '—'}
                        </span>
                    </button>
                </RowHost>

                {isOpen && b.ideas.map(h => (
                    <RowHost key={h.id} actions={holdingActions(h)}>
                        <button
                            className="floor-row floor-row--sub"
                            onClick={() => openIdeaPopup(h)}
                            title="Open this holding"
                        >
                            <span className={`floor-row__dir floor-row__dir--${h.direction}`} aria-hidden="true">
                                {h.direction === 'short' ? '▾' : '▴'}
                            </span>
                            <span className="floor-row__sym">{h.asset ?? '—'}</span>
                            {/* allocationRatio is a 0–1 ratio, not a percentage */}
                            <span className="floor-row__kind floor-row__kind--dim">{pctOf(h.allocationRatio)}</span>
                            <span className={`floor-row__status floor-row__status--${h.status}`}>{statusText(h.status)}</span>
                        </button>
                    </RowHost>
                ))}
            </div>
        )
    })
}
PortfolioRows.propTypes = {
    ideas:             PropTypes.array,
    positions:         PropTypes.array,
    onEditPortfolio:   PropTypes.func,
    onDeletePortfolio: PropTypes.func,
    onDeleteIdea:      PropTypes.func,
}

// ── Scans ─────────────────────────────────────────────────────────────────────
// A scan's row is its thesis; its candidates are the sub-rows. Expanding is local to the row, so
// several scans can be open at once — unlike the desks, these are peers being compared.

function ScanRows({ scans, onCandidateSelect, onEditScan, onDeleteScan }) {
    const [open, setOpen] = useState(() => new Set())
    if (!scans.length) return <Empty>No lists yet.</Empty>

    const toggle = id => setOpen(prev => {
        const next = new Set(prev)
        next.has(id) ? next.delete(id) : next.add(id)
        return next
    })

    // Actions belong to the LIST, not to the names on it. A candidate is a line in a scan's result,
    // not a record of its own — there is nothing to open in a chat and nothing to delete. Editing
    // the list is how a candidate leaves it; clicking one still means "build from this".
    function scanActions(s) {
        if (!onEditScan && !onDeleteScan) return null
        return (
            <>
                {onEditScan && <EditButton onClick={() => onEditScan(s)} title="Edit list in the scanner chat" size="sm" />}
                {onDeleteScan && <DeleteButton onClick={() => onDeleteScan(s.id)} title="Delete list" size="sm" />}
            </>
        )
    }

    return scans.map(s => {
        const isOpen = open.has(s.id)
        return (
            <div key={s.id} className="floor-sub">
                <RowHost actions={scanActions(s)}>
                    <button className="floor-row" onClick={() => toggle(s.id)} aria-expanded={isOpen}>
                        <span className={`floor-row__dir floor-row__dir--${s.direction}`} aria-hidden="true">
                            {s.direction === 'short' ? '▾' : '▴'}
                        </span>
                        <span className="floor-row__sym floor-row__sym--wide">{s.thesis}</span>
                        {/* The candidate count belongs to the thesis, so it rides directly after it —
                            a lone number on the right edge reads as a column of its own. */}
                        <span className="floor-row__count">({s.candidates?.length ?? 0})</span>
                        {s.stale && <span className="floor-row__stale">stale</span>}
                    </button>
                </RowHost>
                {isOpen && (s.candidates ?? []).map(c => (
                    <button
                        key={c.ticker}
                        className="floor-row floor-row--sub"
                        onClick={() => onCandidateSelect?.(c, s)}
                        title="Build from this candidate"
                    >
                        <span className="floor-row__sym">{c.ticker}</span>
                        <span className="floor-row__kind floor-row__kind--dim">{c.name ?? ''}</span>
                        {Number.isFinite(c.score?.total) && (
                            <span className={`floor-row__score floor-row__score--${c.score.total >= 75 ? 'hi' : c.score.total >= 55 ? 'mid' : 'lo'}`}>
                                {c.score.total}
                            </span>
                        )}
                    </button>
                ))}
            </div>
        )
    })
}
ScanRows.propTypes = {
    scans:             PropTypes.array,
    onCandidateSelect: PropTypes.func,
    onEditScan:        PropTypes.func,
    onDeleteScan:      PropTypes.func,
    onEditCoverage:    PropTypes.func,
    onRetireCoverage:  PropTypes.func,
    onDeleteCoverage:  PropTypes.func,
}

// ── Coverage ──────────────────────────────────────────────────────────────────

const RATING_LABEL = { strong_buy: 'strong buy', buy: 'buy', hold: 'hold', sell: 'sell', strong_sell: 'strong sell' }

const asList = (v) => (Array.isArray(v) ? v : [])
// Catalysts arrive as { date, note } or as a bare string, depending on how the thesis was written.
const catalystText = (k) => (typeof k === 'string' ? k : `${k?.date ? `${k.date}: ` : ''}${k?.note ?? ''}`)
const killText     = (k) => (typeof k === 'string' ? k : JSON.stringify(k))

function CoverageRows({ coverage, onEditCoverage, onRetireCoverage, onDeleteCoverage }) {
    // Several names open at once, like the scans: these are peers you compare, not sections you
    // navigate. (The desks above are the accordion; this is a list inside one.)
    const [open, setOpen] = useState(() => new Set())
    if (!coverage.length) return <Empty>No coverage yet.</Empty>

    const toggle = id => setOpen(prev => {
        const next = new Set(prev)
        next.has(id) ? next.delete(id) : next.add(id)
        return next
    })

    return coverage.map(c => {
        const key    = c.id ?? c.symbol
        const kills  = asList(c.kill_criteria)
        const cats   = asList(c.catalysts)
        const revs   = asList(c.revisions)
        // Nothing to open → no chevron. A control that expands to an empty box is worse than none.
        const hasDetail = !!(c.thesis || kills.length || cats.length || revs.length)
        const isOpen = hasDetail && open.has(key)

        return (
            <div key={key} className="floor-sub">
                <RowHost actions={<CoverageActions coverage={c} onEdit={onEditCoverage} onRetire={onRetireCoverage} onDelete={onDeleteCoverage} />}>
                    <button
                        className={`floor-row${hasDetail ? '' : ' floor-row--static'}`}
                        onClick={hasDetail ? () => toggle(key) : undefined}
                        aria-expanded={hasDetail ? isOpen : undefined}
                        title={hasDetail ? (isOpen ? 'Hide thesis' : 'Show thesis') : undefined}
                    >
                        {hasDetail && (
                            <svg className={`floor-row__chev${isOpen ? ' floor-row__chev--open' : ''}`} viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        )}
                        <span className="floor-row__sym">{c.symbol}</span>
                        {c.rating && <span className={`floor-row__rating floor-row__rating--${c.rating}`}>{RATING_LABEL[c.rating] ?? c.rating}</span>}
                        {c.price_target?.value != null && (
                            <span className="floor-row__pt">
                                {c.price_target.value}
                                {c.gap?.pct != null && (
                                    <span className={`floor-row__gap ${c.gap.pct >= 0 ? 'is-pos' : 'is-neg'}`}>
                                        {c.gap.pct >= 0 ? '+' : ''}{c.gap.pct}%
                                    </span>
                                )}
                            </span>
                        )}
                        <span className={`floor-row__status floor-row__status--${c.status}`}>{c.status}</span>
                    </button>
                </RowHost>

                {isOpen && (
                    <div className="floor-detail">
                        {c.thesis && <p className="floor-detail__prose">{c.thesis}</p>}
                        {kills.length > 0 && (
                            <div className="floor-detail__block">
                                <span className="floor-detail__label">kill-criteria</span>
                                <ul>{kills.map((k, i) => <li key={i}>{killText(k)}</li>)}</ul>
                            </div>
                        )}
                        {cats.length > 0 && (
                            <div className="floor-detail__block">
                                <span className="floor-detail__label">catalysts</span>
                                <ul>{cats.map((k, i) => <li key={i}>{catalystText(k)}</li>)}</ul>
                            </div>
                        )}
                        {revs.length > 0 && (
                            <span className="floor-detail__revs">{revs.length} revision{revs.length > 1 ? 's' : ''}</span>
                        )}
                    </div>
                )}
            </div>
        )
    })
}
CoverageRows.propTypes = { coverage: PropTypes.array, onEditCoverage: PropTypes.func, onRetireCoverage: PropTypes.func, onDeleteCoverage: PropTypes.func }

// ── The column ────────────────────────────────────────────────────────────────

export function FloorLists({
    calls = [], setups = [], ideas = [], positions = [],
    scans = [], coverage = [],
    onCandidateSelect,
    onEditCall, onDeleteCall, onEditSetup, onDeleteSetup,
    onEditPortfolio, onDeletePortfolio, onDeleteIdea,
    onEditScan, onDeleteScan,
    onEditCoverage, onRetireCoverage, onDeleteCoverage,
    initialDesk = null,
}) {
    // One desk open at a time — clicking the open one closes it, leaving all four collapsed. That
    // "all closed" state is legitimate: it turns the column into a table of contents — which is
    // also why it is the state a fresh load lands in. Opening a desk is a choice the reader makes,
    // not one a refresh makes for them.
    const [openKey, setOpenKey] = useState(initialDesk)
    const toggle = key => setOpenKey(cur => (cur === key ? null : key))

    const counts = {
        trade:     calls.length + setups.length,
        portfolio: portfoliosFromIdeas(ideas).length,
        scans:     scans.length,
        coverage:  coverage.length,
    }

    return (
        <aside className="floor-lists">
            {/* Same .floor-sec heading the left column uses, so all three columns open on one
                line across the app rather than three near-misses. */}
            <header className="floor-sec">
                <h2 className="floor-sec__title">Lists</h2>
            </header>

            {DESKS.map(desk => (
                <Desk
                    key={desk.key}
                    desk={desk}
                    open={openKey === desk.key}
                    count={counts[desk.key]}
                    onToggle={toggle}
                >
                    {desk.key === 'trade'     && (
                        <TradeRows
                            calls={calls} setups={setups}
                            onEditCall={onEditCall} onDeleteCall={onDeleteCall}
                            onEditSetup={onEditSetup} onDeleteSetup={onDeleteSetup}
                        />
                    )}
                    {desk.key === 'portfolio' && (
                        <PortfolioRows
                            ideas={ideas} positions={positions}
                            onEditPortfolio={onEditPortfolio} onDeletePortfolio={onDeletePortfolio}
                            onDeleteIdea={onDeleteIdea}
                        />
                    )}
                    {desk.key === 'scans'     && (
                        <ScanRows
                            scans={scans} onCandidateSelect={onCandidateSelect}
                            onEditScan={onEditScan} onDeleteScan={onDeleteScan}
                        />
                    )}
                    {/* Edit reopens Prometheus on the thesis; Retire archives it (trail kept);
                        Delete removes it for good. Retiring is still a research decision, not a bin —
                        which is exactly why it is a separate button from Delete.

                        They ride in RowHost like every other desk — on the ROW, revealed on hover or
                        focus. They started life in the expanded detail, which meant you had to open a
                        thesis before you could act on one; actions you have to go looking for are
                        actions nobody finds. Same component as the Radar book, so the book offers one
                        set of controls wherever you meet it. */}
                    {desk.key === 'coverage'  && (
                        <CoverageRows
                            coverage={coverage}
                            onEditCoverage={onEditCoverage} onRetireCoverage={onRetireCoverage} onDeleteCoverage={onDeleteCoverage}
                        />
                    )}
                </Desk>
            ))}
        </aside>
    )
}

FloorLists.propTypes = {
    calls:             PropTypes.array,
    setups:            PropTypes.array,
    ideas:             PropTypes.array,
    positions:         PropTypes.array,
    scans:             PropTypes.array,
    coverage:          PropTypes.array,
    onCandidateSelect: PropTypes.func,
    onEditCall:        PropTypes.func,
    onDeleteCall:      PropTypes.func,
    onEditSetup:       PropTypes.func,
    onDeleteSetup:     PropTypes.func,
    onEditPortfolio:   PropTypes.func,
    onDeletePortfolio: PropTypes.func,
    onDeleteIdea:      PropTypes.func,
    onEditScan:        PropTypes.func,
    onDeleteScan:      PropTypes.func,
    initialDesk:       PropTypes.string,
}
