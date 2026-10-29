import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import { groupByLifecycle, isPreEntry, isLivePosition } from '../../services/entityStatus.js'
import {
    openCallPopup, openSetupPopup, openIdeaPopup,
    portfoliosFromIdeas, portfolioPnl, formatPnl, isDeleteLocked, isPortfolioReview, isManualIdea,
} from '../TradeIdeas/tradeIdea.utils.js'
import { EditButton, DeleteButton, ActivateButton, SymbolCell } from '../EntityCard/EntityCard.jsx'
import { ActivatePortfolioDialog } from '../TradeIdeas/ActivatePortfolioDialog.jsx'
import { tradeFloorItems } from './floor.utils.js'
import { DESK_SORTS, sortOption, sortRows } from './floor.sort.js'
import { actionLine, originLine, actionVerb } from './queuedAction.contract.js'
import { RowHost } from './RowHost.jsx'
import { CalendarPanel, CALENDAR_PANEL_ID } from './CalendarPanel.jsx'
import { ForecastPanel, FORECAST_PANEL_ID } from './ForecastPanel.jsx'
import { HotlistPanel, HOTLIST_PANEL_ID } from './HotlistPanel.jsx'
import { IndustryView } from '../Radar/IndustryView.jsx'
import { useActivePanel, useUnderPanel, togglePanel, openPanel } from '../DetailPanel/detailPanel.store.js'
import { DetailPanel } from '../DetailPanel/DetailPanel.jsx'
import { FloorLeft } from './FloorLeft.jsx'

import './Floor.scss'
import { AetherCandidates } from '../TradeIdeas/AetherCandidates.jsx'
import { HouseChip } from '../HouseChip/HouseChip.jsx'

// The Floor's right column: four desks, one open at a time — and the open one TAKES THE COLUMN.
//
// The other headers fold away while a desk is open, so the list gets the whole height instead of
// the leftovers under three stacked buttons. Closing it unfolds them back into their original
// order, which is why they stay mounted and merely collapse: the column is one arrangement in two
// states, not two different columns, and animating between them is what says so.
//
// Every row is ONE LINE and carries only what you'd scan for — never the whole entity. Anything
// more is a click away — in the pop-out that kind already has (entityPopup.js: setups, ideas), or,
// for the rows whose detail is a page of reading with no entity page behind it (coverage, the
// events radar's names, Pythia's rows), in the DetailPanel over the chat column. Which is why there
// are no cards here: a card exists to hold a summary you can't fit on a line, and once the detail
// lives elsewhere there is nothing left for it to hold.
//
// The desks differ in WHAT they list; the shell — header, count, open/close, empty state — is the
// same for all four, so it lives once in <Desk> and each desk supplies only its rows.

const DESKS = [
    // Queued sits FIRST because it is the only desk that is a to-do list: the others are things
    // you own, this one is things waiting on you. A count here means someone is blocked.
    // Named for what the reader owns, not for the desk's metaphor (Roy, 2026-10-14): "Trading
    // floor" / "Portfolio floor" / "Scans" became "Your trades" / "Your portfolios" / "Watchlists".
    // The KEYS stay — they are what sorts, desk requests and tests address.
    // Every list opens in the DETAIL WINDOW over the chat (Roy, 2026-10-22) — the column is the launcher: a header
    // opens its list's window (ListPanel) and the column stays as it is, like the Calendar's always did.
    // POSITIONS — the book, first in the Menu (Roy, 2026-10-23: the left column is the Menu, every list in it, Positions
    // included); it opens in the detail window over the chat like the rest.
    { key: 'positions',      label: 'Positions',       panel: 'floor:positions' },
    { key: 'queued',         label: 'Awaiting orders', panel: 'floor:queued' },
    { key: 'trade',          label: 'Your trades',     panel: 'floor:trade' },
    { key: 'portfolio',      label: 'Your portfolios', panel: 'floor:portfolio' },
    { key: 'scans',          label: 'Watchlists',      panel: 'floor:scans' },
    // THE HOTLIST — the screener's daily board of names in play, graded per horizon by free range,
    // with Argus's read of it; opens over the chat like the Calendar (HotlistPanel; daily-names.md §8,
    // Roy 2026-10-21). Named "Hotlist", not "Daily watchlist", to stay clear of Watchlists above.
    { key: 'hotlist',        label: 'Hotlist', panel: HOTLIST_PANEL_ID },
    // HIDDEN FOR NOW (Roy, 2026-10-14), not deleted: its rows, counts and sorts all still work, and
    // dropping the flag brings it back. MainPage still loads the candidates for the Aether desk.
    { key: 'aether',         label: 'Events radar', hidden: true },

    // THE CALENDAR — one desk that opens a month grid in the detail panel (CalendarPanel), not a
    // list in this column (Roy, 2026-10-14). It replaced the Earnings, Fed and IPO desks: three
    // week-long lists became one month, each day showing its three counts, each day opening to its
    // rows. `panel` marks a desk whose header toggles a DetailPanel instead of taking the column.
    // (Before that the three were tabs in the left column, until 2026-08-19.)
    { key: 'calendar',  label: 'Calendar', panel: CALENDAR_PANEL_ID },
    // FORECASTS — a heat map of every industry in the detail panel (ForecastPanel), opened to its
    // Pythia thesis and its companies, and a covered company to Prometheus's thesis (Roy, 2026-10-14).
    // It replaced two desks: the Forecasts board as a list here, and "Analyst companies" (the coverage
    // book) — a covered name is now reached through its industry.
    //
    // OPEN TO EVERYONE since 2026-10-05 (Roy): the house's industry views are a broadcast every user
    // reads. Only authoring them — Pythia's desk — is admin-only.
    { key: 'forecasts', label: 'Forecasts', panel: FORECAST_PANEL_ID },
    // PYTHIA'S BOARD — the Assessed / Themes / Structure tabs, with the track record, the week and the
    // admin's Assess now and theme approval. Reached from the map's "Board" button, not from a header of
    // its own: an `onRequest` desk is listed only while it is open (Roy, 2026-10-14). It lives in the
    // COLUMN, not in the map's panel, because every one of its rows opens a panel of its own — inside the
    // map's panel the first click would replace the panel holding the board, and close it.
    { key: 'board', label: 'Forecast board', onRequest: true, panel: 'floor:board' },
    // Admin-only: the house research pipeline backlog (Argus hits + user coverage_request). LAST
    // (Roy, 2026-10-14): it is house plumbing, not part of the reader's own run of desks.
    { key: 'research_queue', label: 'Research queue', adminOnly: true, panel: 'floor:research_queue' },
    // A `channels` desk sat here — Aether's z-score per pressure channel. It went with the
    // channel engine on 2026-09-09, along with the collection behind it.
]

function openFor(item) {
    if (item.kind === 'call')  return openCallPopup(item.entity)
    if (item.kind === 'setup') return openSetupPopup(item.entity)
    return openIdeaPopup(item.entity)
}

// An EMPTY desk stays in the column, dimmed — never removed (Roy, 2026-10-14). Hiding it would
// move every header below it each time a count crossed zero, and the column is read by position;
// it would also hide the desk from the one reader who most needs to learn it exists. The dim says
// "nothing here" at a glance; the empty state inside says who fills it.
//
// A `panel` desk (the Calendar) never takes the column: its header opens a DetailPanel, so it
// announces a dialog and reports THAT as its expanded state — which also gives it the shared
// "row the panel came from" highlight (DetailPanel.scss).
function Desk({ desk, open, collapsed, empty, panelOpen = false, count, onToggle, children }) {
    return (
        <section className={`floor-desk${open ? ' floor-desk--open' : ''}${collapsed ? ' floor-desk--folded' : ''}${empty ? ' floor-desk--empty' : ''}`}>
            <button
                className="floor-desk__head"
                onClick={() => onToggle(desk.key)}
                aria-expanded={desk.panel ? panelOpen : open}
                aria-haspopup={desk.panel ? 'dialog' : undefined}
                // Folded away, so out of the tab order — but NOT aria-hidden: the header still
                // exists and still reports whether its desk is open, which is what a screen reader
                // (and every test in this folder) reads to know the state of the column.
                tabIndex={collapsed ? -1 : undefined}
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
    desk:      PropTypes.object.isRequired,
    open:      PropTypes.bool,
    collapsed: PropTypes.bool,
    empty:     PropTypes.bool,
    panelOpen: PropTypes.bool,
    count:    PropTypes.number,
    onToggle: PropTypes.func.isRequired,
    children: PropTypes.node,
}

// ── The desk strip ────────────────────────────────────────────────────────────
// While a desk is open the other headers fold away, so the list gets the column — but the counts
// went with them, and a count is the one thing on the Floor worth seeing without a click ("Awaiting
// orders (2)" means someone is blocked). The strip keeps every desk and its count on screen in a
// few wrapped lines, in the column's own order, the open one marked; one click switches desks
// (Roy, 2026-10-14). It is not shown when every desk is closed: the headers ARE the strip then.
// A panel desk's chip (Calendar) opens its panel, and is marked while that panel is open.
function DeskStrip({ desks, openKey, activePanelId = null, counts, isEmpty, onToggle }) {
    return (
        <nav className="floor-strip" aria-label="Desks">
            {desks.map(desk => {
                const panelOpen = !!desk.panel && activePanelId === desk.panel
                const active = desk.key === openKey || panelOpen
                const count = counts[desk.key]
                return (
                    <button
                        key={desk.key}
                        type="button"
                        className={`floor-strip__chip${active ? ' floor-strip__chip--active' : ''}${isEmpty(desk.key) ? ' floor-strip__chip--empty' : ''}`}
                        aria-current={desk.key === openKey ? 'true' : undefined}
                        aria-haspopup={desk.panel ? 'dialog' : undefined}
                        aria-expanded={desk.panel ? panelOpen : undefined}
                        onClick={() => onToggle(desk.key)}
                    >
                        {desk.label}
                        {count > 0 && <span className="floor-strip__count">({count})</span>}
                    </button>
                )
            })}
        </nav>
    )
}
DeskStrip.propTypes = {
    desks:    PropTypes.array.isRequired,
    openKey:  PropTypes.string,
    activePanelId: PropTypes.string,
    counts:   PropTypes.object.isRequired,
    isEmpty:  PropTypes.func.isRequired,
    onToggle: PropTypes.func.isRequired,
}

/**
 * A list's WINDOW over the chat (Roy, 2026-10-22): no header — the list starts at the top, a small ✕ in the corner (the
 * column's header says which list it is). A CONTAINER: a row that opens a panel of its own (the board's industries)
 * keeps the list under it, and closing that panel steps back to the list.
 */
function ListPanel({ desk, children }) {
    return (
        <DetailPanel id={desk.panel} title={desk.label} container bare className={`floor-panel floor-panel--${desk.key}`}>
            {/* The rows keep the desk body they were laid out in (Floor.scss: .floor-desk__body …). */}
            <div className="floor-desk__body floor-panel__body">{children}</div>
        </DetailPanel>
    )
}
ListPanel.propTypes = { desk: PropTypes.object.isRequired, children: PropTypes.node }

const Empty = ({ children }) => <p className="floor-empty">{children}</p>
Empty.propTypes = { children: PropTypes.node }

// ── Sorting ───────────────────────────────────────────────────────────────────
// One bar for every desk, pinned to the top of the open desk's body. The options are the desk's
// (floor.sort.js); the bar only renders them. It shows when there are two rows or more — a sort
// control over a single row is a control that cannot do anything.
//
// The choice is remembered per desk, per browser: it is a reading preference, like which way you
// keep a drawer, and losing it on every reload would make the control feel like it didn't stick.
const SORT_KEY = 'floorSorts'
const readSorts  = () => { try { return JSON.parse(localStorage.getItem(SORT_KEY)) ?? {} } catch { return {} } }
const writeSorts = (s) => { try { localStorage.setItem(SORT_KEY, JSON.stringify(s)) } catch { /* private mode */ } }

function SortBar({ deskKey, sort, onChange }) {
    const options = DESK_SORTS[deskKey]
    const opt = sortOption(deskKey, sort)
    const dir = opt ? (sort.dir ?? opt.dir) : null
    return (
        <div className="floor-sort">
            <label className="floor-sort__label">
                Sort
                <select
                    className="floor-sort__select"
                    value={opt ? opt.key : 'default'}
                    onChange={e => {
                        const next = options.find(o => o.key === e.target.value)
                        onChange(next?.dir ? { key: next.key, dir: next.dir } : null)
                    }}
                >
                    {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
            </label>
            <button
                type="button"
                className="floor-sort__dir"
                onClick={() => onChange({ key: opt.key, dir: dir === 'asc' ? 'desc' : 'asc' })}
                disabled={!opt}
                aria-label={dir === 'desc' ? 'Descending — switch to ascending' : 'Ascending — switch to descending'}
                title={opt ? (dir === 'desc' ? 'Descending' : 'Ascending') : 'The default order has no direction'}
            >{dir === 'desc' ? '↓' : '↑'}</button>
        </div>
    )
}
SortBar.propTypes = {
    deskKey:  PropTypes.string.isRequired,
    sort:     PropTypes.object,
    onChange: PropTypes.func.isRequired,
}

// ── Queued ────────────────────────────────────────────────────────────────────
// Work confirmed while a venue was shut (nothing executes off-hours, paper included) plus anything
// the market-open sweep has already unparked. One row per thing waiting on you.
//
// The row says WHAT WILL HAPPEN and WHERE IT CAME FROM, because by the time you read it the review
// that decided it is long closed — "Trim 30% of MU · Growth review" is the whole point of the row.
// Both strings come from queuedAction.contract, which owns the per-verb judgment; this component
// only lays it out.

function QueuedRow({ row, onExecute, onCancel, busy }) {
    const ready = row.ready !== false
    return (
        <RowHost
            actions={
                <>
                    <button
                        className="floor-queued__btn"
                        onClick={() => onExecute(row)}
                        disabled={!ready || busy}
                        title={ready ? undefined : 'Its market has not opened yet'}
                    >{actionVerb(row)}</button>
                    {/* Cancel is offered only where dropping the row actually settles something:
                        a discretionary decision the user may have changed their mind about. An
                        entity awaiting confirmation is dismissed by the surface that owns it, and
                        a monitor's exit is the consequence of a stop that is still breached — it
                        would simply re-queue on the next tick. The server decides which is which
                        (`cancellable`); this only renders it. */}
                    {row.cancellable && (
                        <button
                            className="floor-queued__btn floor-queued__btn--cancel"
                            onClick={() => onCancel(row)}
                            disabled={busy}
                            title="Cancel — the desk that decided it is told"
                        >Cancel</button>
                    )}
                </>
            }
        >
            <span className={`floor-queued__dot${ready ? '' : ' floor-queued__dot--waiting'}`} aria-hidden="true" />
            <span className="floor-queued__line">{actionLine(row)}</span>
            {originLine(row) && <span className="floor-queued__from">{originLine(row)}</span>}
            {!ready && <span className="floor-queued__pending">waiting for the open</span>}
        </RowHost>
    )
}
QueuedRow.propTypes = {
    row:       PropTypes.object.isRequired,
    onExecute: PropTypes.func.isRequired,
    onCancel:  PropTypes.func.isRequired,
    busy:      PropTypes.bool,
}

function QueuedRows({ queued, onExecute, onCancel, busyId }) {
    if (!queued.length) return <Empty>Nothing waiting on you.</Empty>
    return (
        <>
            {queued.map(row => (
                <QueuedRow
                    key={`${row.source}:${row.id}`}
                    row={row}
                    onExecute={onExecute}
                    onCancel={onCancel}
                    busy={busyId === row.id}
                />
            ))}
        </>
    )
}
QueuedRows.propTypes = {
    queued:    PropTypes.array.isRequired,
    onExecute: PropTypes.func.isRequired,
    onCancel:  PropTypes.func.isRequired,
    busyId:    PropTypes.string,
}

// ── Your trades (was "Trading floor") ─────────────────────────────────────────

// A trade row keeps the same action contract SetupCard uses, so a setup behaves identically
// whether you reach it from a card or from this line. `kind` is still carried on the row: calls
// were the second kind until Kairos was archived (2026-08-18), and a second trade kind is the
// expected case here rather than a special one.
//
//  · the pencil returns the entity to the chat that BUILT it (Mentor), and only while the
//    trade is pre-entry — once a position is live, changes go through management cards, not a
//    re-run of the build conversation;
//  · the bin locks while a position is live — deleting would leave that position open at the
//    broker with nothing left describing it, so no monitor manages its stop. The server refuses
//    it (409 reason:'in_position') for every kind; don't render an action that can only fail.

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

function TradeRows({ setups, onEditSetup, onDeleteSetup, onSymbolClick }) {
    const items = tradeFloorItems(setups)
    if (!items.length) return <Empty>No setups yet — build one with Mentor.</Empty>

    const actionsFor = it => setupActions(it.entity, onEditSetup, onDeleteSetup)

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
                        <SymbolCell className="floor-row__sym" symbol={it.ticker} onSymbolClick={onSymbolClick} />
                        <span className="floor-row__kind">{it.kind}</span>
                        <span className={`floor-row__status floor-row__status--${it.status}`}>{it.status}</span>
                    </button>
                </RowHost>
            ))}
        </div>
    ))
}
TradeRows.propTypes = {
    onSymbolClick: PropTypes.func,
    setups:        PropTypes.array,
    onEditSetup:   PropTypes.func,
    onDeleteSetup: PropTypes.func,
}

// ── Your portfolios (was "Portfolio floor") ───────────────────────────────────

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

// A book nobody has said go to yet: built, saved, and doing nothing. Every leg, not some — one leg
// already working means the book is being managed, and re-firing it as a book is not the move.
const isWaitingBook = (b) => b.ideas.length > 0 && b.ideas.every(i => i.status === 'waiting')

function PortfolioRows({ ideas, positions, sort, onEditPortfolio, onDeletePortfolio, onDeleteIdea, onActivatePortfolio, onSymbolClick }) {
    // Sorted HERE rather than by the column: a book is reconstructed from its ideas, so there is
    // nothing to sort until portfoliosFromIdeas has run.
    const books = sortRows(portfoliosFromIdeas(ideas), 'portfolio', sort, { pnlOf: b => portfolioPnl(b.ideas, positions) })
    const [openKey, setOpenKey] = useState(null)
    // The book waiting on the pre-activation gate, or null. Same dialog the ideas table and the
    // cards put in front of this — activating fires every leg at market at once, so the last thing
    // between a built book and real exposure is the offer of a final Atlas review.
    const [activating, setActivating] = useState(null)
    if (!books.length) return <Empty>No portfolios yet — build one with Atlas.</Empty>

    const toggle = id => setOpenKey(cur => cur === id ? null : id)

    // The book's own actions, which are NOT the sum of its holdings': editing reopens the whole
    // construction in the Atlas chat, and deleting removes every leg plus the chat history. That's
    // why ONE live leg locks the bin for the entire book — the same rule the ideas table applies.
    function bookActions(b) {
        if (!onEditPortfolio && !onDeletePortfolio && !onActivatePortfolio) return null
        const anyLocked = b.ideas.some(isDeleteLocked)
        // The same live leg that locks the bin also decides what the pencil opens: handleEditPortfolio
        // reviews a book in positions rather than re-planning it, so the title says which one it is.
        // Nothing is passed in — the mode is the book's to decide, not this surface's.
        const willReview = isPortfolioReview(b.ideas)
        return (
            <>
                {/* A built book sits at 'waiting' until someone says go, and this list had no way to
                    say it — the pencil and the bin were the whole vocabulary, so a finished portfolio
                    looked identical to a live one and the only way to activate was the other list.
                    Offered ONLY while every leg is still waiting: a book that is half-working is
                    managed leg by leg, not re-fired as a book. */}
                {onActivatePortfolio && isWaitingBook(b) && (
                    <ActivateButton
                        onClick={() => setActivating(b)}
                        title="Activate this portfolio — fires every holding"
                        size="sm"
                    />
                )}
                {onEditPortfolio && (
                    <EditButton
                        onClick={() => onEditPortfolio(b.portfolioId)}
                        title={willReview ? 'In position — opens a review in chat' : 'Edit portfolio in chat'}
                        size="sm"
                    />
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

    const rows = books.map(b => {
        const isOpen   = openKey === b.portfolioId
        const isFolded = openKey !== null && openKey !== b.portfolioId
        const pnl      = portfolioPnl(b.ideas, positions)
        const waiting  = isWaitingBook(b)
        return (
            <div key={b.portfolioId} className={`floor-sub${isOpen ? ' floor-sub--open' : isFolded ? ' floor-sub--folded' : ''}`}>
                <RowHost actions={bookActions(b)}>
                    <button className="floor-row" onClick={() => toggle(b.portfolioId)} aria-expanded={isOpen}>
                        <span className="floor-row__sym floor-row__sym--wide">{b.name}</span>
                        <span className="floor-row__kind">({b.ideas.length} holdings)</span>
                        {/* Said on the row, not left to be inferred from an empty P&L: a built book
                            and a working one read identically otherwise, which is how a portfolio
                            sits un-activated without anyone noticing. */}
                        {waiting && <span className="floor-row__status floor-row__status--waiting">waiting</span>}
                        <span className={`floor-row__pnl ${pnl?.pnl > 0 ? 'is-pos' : pnl?.pnl < 0 ? 'is-neg' : ''}`}>
                            {pnl ? formatPnl(pnl.pnl, pnl.currency) : '—'}
                        </span>
                    </button>
                </RowHost>

                {isOpen && (
                    <div className="floor-sub__body">
                        {b.ideas.map(h => (
                            <RowHost key={h.id} actions={holdingActions(h)}>
                                <button
                                    className="floor-row floor-row--sub"
                                    onClick={() => openIdeaPopup(h)}
                                    title="Open this holding"
                                >
                                    <span className={`floor-row__dir floor-row__dir--${h.direction}`} aria-hidden="true">
                                        {h.direction === 'short' ? '▾' : '▴'}
                                    </span>
                                    <SymbolCell className="floor-row__sym" symbol={h.asset} onSymbolClick={onSymbolClick} />
                                    {/* allocationRatio is a 0–1 ratio, not a percentage */}
                                    <span className="floor-row__kind floor-row__kind--dim">{pctOf(h.allocationRatio)}</span>
                                    <span className={`floor-row__status floor-row__status--${h.status}`}>{statusText(h.status)}</span>
                                </button>
                            </RowHost>
                        ))}
                    </div>
                )}
            </div>
        )
    })

    return (
        <>
            {rows}
            {activating && (
                <ActivatePortfolioDialog
                    name={activating.name}
                    count={activating.ideas.length}
                    manual={activating.ideas.some(isManualIdea)}
                    // Review instead: reopening the book in Atlas is the alternative to firing it,
                    // and handleEditPortfolio resets the legs to waiting, so the book stays pending
                    // until the user comes back and activates.
                    onReview={() => { const b = activating; setActivating(null); onEditPortfolio?.(b.portfolioId, { reviewMode: true }) }}
                    onActivate={() => { const b = activating; setActivating(null); onActivatePortfolio?.(b.portfolioId) }}
                    onClose={() => setActivating(null)}
                />
            )}
        </>
    )
}
PortfolioRows.propTypes = {
    onSymbolClick: PropTypes.func,
    ideas:               PropTypes.array,
    positions:           PropTypes.array,
    sort:                PropTypes.object,
    onEditPortfolio:     PropTypes.func,
    onDeletePortfolio:   PropTypes.func,
    onDeleteIdea:        PropTypes.func,
    onActivatePortfolio: PropTypes.func,
}

// ── Scans ─────────────────────────────────────────────────────────────────────
// A scan's row is its thesis; its candidates are the sub-rows. Expanding is local to the row, so
// several scans can be open at once — unlike the desks, these are peers being compared.

function ScanRows({ scans, onCandidateSelect, onEditScan, onDeleteScan, onSymbolClick }) {
    const [openKey, setOpenKey] = useState(null)
    if (!scans.length) return <Empty>No watchlists yet — ask Argus what to watch.</Empty>

    const toggle = id => setOpenKey(cur => cur === id ? null : id)

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
        const isOpen   = openKey === s.id
        const isFolded = openKey !== null && openKey !== s.id
        return (
            <div key={s.id} className={`floor-sub${isOpen ? ' floor-sub--open' : isFolded ? ' floor-sub--folded' : ''}`}>
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
                {isOpen && (
                    <div className="floor-sub__body">
                        {(s.candidates ?? []).map(c => (
                            <button
                                key={c.ticker}
                                className="floor-row floor-row--sub"
                                onClick={() => onCandidateSelect?.(c, s)}
                                title="Build from this candidate"
                            >
                                <SymbolCell className="floor-row__sym" symbol={c.ticker} onSymbolClick={onSymbolClick} owned />
                                <span className="floor-row__kind floor-row__kind--dim">{c.name ?? ''}</span>
                                <HouseChip house={c.house} />
                                {Number.isFinite(c.score?.total) && (
                                    <span className={`floor-row__score floor-row__score--${c.score.total >= 75 ? 'hi' : c.score.total >= 55 ? 'mid' : 'lo'}`}>
                                        {c.score.total}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        )
    })
}
ScanRows.propTypes = {
    onSymbolClick: PropTypes.func,
    scans:             PropTypes.array,
    onCandidateSelect: PropTypes.func,
    onEditScan:        PropTypes.func,
    onDeleteScan:      PropTypes.func,
    onEditCoverage:    PropTypes.func,
    onRetireCoverage:  PropTypes.func,
    onDeleteCoverage:  PropTypes.func,
}

// ── Research queue (admin) ────────────────────────────────────────────────────
// The house research pipeline backlog. Each row is one name waiting to be researched by Prometheus.
//
// Start claims the name AND opens Prometheus on it, with the mandate that surfaced it as the opening
// turn — MainPage owns that hand-off (handleStartResearch). It used to only flip the status and
// leave "open Prometheus on the name manually" to the admin, which read as a button that did
// nothing: the row said "in progress" and nothing was in progress. Done closes it (MainPage also
// does this on its own when coverage is initiated on the name); Reject is for misfires.
//
// The row itself is STATIC — the same shell as the other desks, but not a doorway. It was one for a
// day: a click anywhere on the line kicked off a four-minute research stream, which is too much to
// hang on a mis-aimed click on a list you are scanning. Starting research is a decision, so it
// lives on the button that says so. The ticker still docks its chart, as on every desk.

const RQ_STATUS_LABEL = { queued: 'queued', in_research: 'in progress', done: 'done', rejected: 'rejected' }
const RQ_SOURCE_LABEL = { argus: 'Argus', manual: 'request' }

function ResearchQueueRow({ item, covered = false, onStart, onDone, onReject, busy, onSymbolClick }) {
    const isQueued     = item.status === 'queued'
    const isInResearch = item.status === 'in_research'
    const isActive     = isQueued || isInResearch
    const openTitle = covered
        ? 'Open Prometheus on this name — already covered, so it opens as an update to the standing thesis'
        : 'Open Prometheus on this name'
    return (
        <RowHost
            actions={isActive && (
                <>
                    {/* Start claims and opens; on a claimed name the same button re-opens WITHOUT a
                        second claim (a refresh mid-stream loses the turn, not the claim), so it is
                        labelled for what it does now. */}
                    <button
                        className="floor-queued__btn"
                        onClick={() => onStart(item)}
                        disabled={busy}
                        title={openTitle}
                    >{isQueued ? 'Start' : 'Open'}</button>
                    {isInResearch && (
                        <button
                            className="floor-queued__btn"
                            onClick={() => onDone(item.id)}
                            disabled={busy}
                            title="Mark done — coverage has been written"
                        >Done</button>
                    )}
                    <button
                        className="floor-queued__btn floor-queued__btn--cancel"
                        onClick={() => onReject(item.id)}
                        disabled={busy}
                        title="Reject — misfire or admin decision"
                    >Reject</button>
                </>
            )}
        >
            {/* Same row as every other desk (.floor-row): one line, fixed height, actions on hover. */}
            <button className="floor-row floor-row--static" type="button" tabIndex={-1}>
                <SymbolCell className="floor-row__sym" symbol={item.symbol} onSymbolClick={onSymbolClick} owned />
                <span className="floor-row__kind floor-row__kind--dim">
                    {RQ_SOURCE_LABEL[item.source] ?? item.source}
                    {item.context?.sector ? ` · ${item.context.sector}` : ''}
                </span>
                {/* The house already holds a thesis on this name — see .floor-queued__covered. */}
                {covered && <span className="floor-queued__covered" title="Already in coverage — opens the standing thesis">covered</span>}
                <span className={`floor-row__status floor-row__status--${item.status}`}>{RQ_STATUS_LABEL[item.status] ?? item.status}</span>
            </button>
        </RowHost>
    )
}
ResearchQueueRow.propTypes = {
    onSymbolClick: PropTypes.func,
    item:     PropTypes.object.isRequired,
    covered:  PropTypes.bool,
    onStart:  PropTypes.func.isRequired,   // receives the ITEM — the opener needs its symbol and context
    onDone:   PropTypes.func.isRequired,
    onReject: PropTypes.func.isRequired,
    busy:     PropTypes.bool,
}

// ── The run strip: the whole queue, researched by Prometheus on the server ──
// One line above the rows. Idle with names queued, it offers Start all; running, it says where the
// run is and offers Stop; finished, it keeps the tally until the next run replaces it. Coverage is
// WRITTEN as each name lands — the admin's read comes after, in the Coverage desk (the pencil opens
// Prometheus in update mode). A covered name is skipped, a no-edge turn is a pass; both leave the
// queue with the reason on the row.
function ResearchRunStrip({ run, queuedCount, claimedCount, onStart, onStop, onRequeue }) {
    const running = run?.status === 'running'
    if (!running && !queuedCount && !claimedCount && !run) return null
    const tally = run ? [
        `${run.covered} covered`,
        run.skipped ? `${run.skipped} skipped` : null,
        run.passed  ? `${run.passed} passed`   : null,
        run.failed  ? `${run.failed} failed`   : null,
    ].filter(Boolean).join(' · ') : ''
    return (
        <div className={`floor-run${running ? ' floor-run--running' : ''}${run?.status === 'failed' ? ' floor-run--failed' : ''}`}>
            {running ? (
                <>
                    <span className="floor-run__dot" aria-hidden="true" />
                    <span className="floor-run__line">
                        Researching {run.current ? <strong>{run.current}</strong> : '…'} — {run.position}/{run.total}
                        {tally ? <span className="floor-run__tally"> · {tally}</span> : null}
                    </span>
                    <button className="floor-queued__btn floor-queued__btn--cancel" onClick={onStop} title="Stop after the name in flight — it stays in progress, re-openable by hand">Stop</button>
                </>
            ) : (
                <>
                    {/* A run that FAILED failed on the account, not a name (see isRunFatal on the
                        server): the sentence the API gave back is the whole explanation, so it is
                        the line — the tally rides in the title. */}
                    <span className="floor-run__line" title={run ? `${run.position}/${run.total} decided — ${tally}${run.error ? `\n${run.error}` : ''}` : undefined}>
                        {run?.status === 'failed'
                            ? <>Run stopped — <strong>{run.error}</strong></>
                            : run
                                ? <>Run {run.status} — {tally}</>
                                : <>{queuedCount} queued</>}
                    </span>
                    {/* Off the QUEUE's count, not the run's: a claim with nothing behind it — a run
                        that died on the account, a turn lost to a refresh — outlives the server's
                        memory of the run, and this is the button that puts it back. */}
                    {claimedCount > 0 && onRequeue && (
                        <button className="floor-queued__btn" onClick={onRequeue} title={`Put the ${claimedCount} name${claimedCount === 1 ? '' : 's'} in progress back in the queue for the next Start all`}>
                            Requeue {claimedCount}
                        </button>
                    )}
                    {queuedCount > 0 && (
                        <button className="floor-queued__btn" onClick={onStart} title="Research every queued name on the server, one after another, and write coverage as each lands. Names already covered are skipped.">
                            Start all
                        </button>
                    )}
                </>
            )}
        </div>
    )
}
ResearchRunStrip.propTypes = { run: PropTypes.object, queuedCount: PropTypes.number, claimedCount: PropTypes.number, onStart: PropTypes.func, onStop: PropTypes.func, onRequeue: PropTypes.func }

function ResearchQueueRows({ researchQueue, coverage = [], onStartResearch, onMarkResearchDone, onRejectResearch, busyId, onSymbolClick, researchRun = null, onStartResearchRun, onStopResearchRun, onRequeueStalledResearch }) {
    // Show active work by default; done/rejected are the steady state and clutter the list.
    const active = researchQueue.filter(i => i.status === 'queued' || i.status === 'in_research')
    const queuedCount  = active.filter(i => i.status === 'queued').length
    const claimedCount = active.length - queuedCount
    const strip = onStartResearchRun
        ? <ResearchRunStrip run={researchRun} queuedCount={queuedCount} claimedCount={claimedCount} onStart={onStartResearchRun} onStop={onStopResearchRun} onRequeue={onRequeueStalledResearch} />
        : null
    if (!active.length) return <>{strip}<Empty>No names queued for research.</Empty></>
    // Argus de-dupes against the QUEUE, not the book, so a covered name arrives here like any other.
    // Any status counts: the backend refuses a fresh initiation on retired coverage too, so
    // Prometheus updates in every case. Upper-cased on both sides — the queue stores tickers
    // upper-case, a coverage doc may not.
    const coveredSyms = new Set(coverage.map(c => String(c?.symbol ?? '').toUpperCase()))
    return (
        <>
            {strip}
            {active.map(item => (
                <ResearchQueueRow
                    onSymbolClick={onSymbolClick}
                    key={item.id}
                    item={item}
                    covered={coveredSyms.has(String(item.symbol ?? '').toUpperCase())}
                    onStart={onStartResearch}
                    onDone={onMarkResearchDone}
                    onReject={onRejectResearch}
                    busy={busyId === item.id}
                />
            ))}
        </>
    )
}
ResearchQueueRows.propTypes = {
    onSymbolClick: PropTypes.func,
    researchQueue:      PropTypes.array.isRequired,
    coverage:           PropTypes.array,
    onStartResearch:    PropTypes.func.isRequired,
    onMarkResearchDone: PropTypes.func.isRequired,
    onRejectResearch:   PropTypes.func.isRequired,
    busyId:             PropTypes.string,
    researchRun:        PropTypes.object,
    onStartResearchRun: PropTypes.func,
    onStopResearchRun:  PropTypes.func,
    onRequeueStalledResearch: PropTypes.func,
}

// ── The column ────────────────────────────────────────────────────────────────

export function FloorLists({
    setups = [], ideas = [], positions = [],
    scans = [], coverage = [], queued = [], aetherCandidates = null,
    onCandidateSelect, onSymbolClick,
    onEditSetup, onDeleteSetup,
    onEditPortfolio, onDeletePortfolio, onDeleteIdea, onActivatePortfolio,
    onEditScan, onDeleteScan,
    onEditCoverage, onRetireCoverage, onDeleteCoverage,
    onExecuteQueued, onCancelQueued, queuedBusyId = null,
    industries = [], industriesLoading = false, industriesError = false, week = null, assessments = null, themes = [],
    onEarningSelect, onIpoSelect,
    onHotlistBuild, onHotlistAsk,
    isAdmin = false,
    researchQueue = [], onStartResearch, onMarkResearchDone, onRejectResearch, researchQueueBusyId = null,
    researchRun = null, onStartResearchRun, onStopResearchRun, onRequeueStalledResearch,
    initialDesk = null, deskRequest = null,
    book = null,
}) {
    // One desk open at a time — clicking the open one closes it, leaving them all collapsed. That
    // "all closed" state is legitimate: it turns the column into a table of contents — which is
    // also why it is the state a fresh load lands in. Opening a desk is a choice the reader makes,
    // not one a refresh makes for them.
    const [requestedKey, setOpenKey] = useState(initialDesk)
    // A panel desk toggles its DetailPanel and leaves the column alone: the list you had open stays
    // open beside the calendar.
    // What the last outside ask pointed the Forecasts map at (`{ symbol }`), handed to its panel.
    const [forecastFocus, setForecastFocus] = useState(null)
    const toggle = key => {
        const panel = DESKS.find(d => d.key === key)?.panel
        if (panel) togglePanel(panel)
        else setOpenKey(cur => (cur === key ? null : key))
    }
    const activePanelId = useActivePanel()
    const underPanelId = useUnderPanel()
    // An initial desk with a window opens the window (tests, a deep link) — the column has nothing to open for it.
    useEffect(() => {
        const panel = DESKS.find(d => d.key === initialDesk && !d.hidden && (!d.adminOnly || isAdmin))?.panel
        if (panel) openPanel(panel)
    }, []) // eslint-disable-line react-hooks/exhaustive-deps -- once, on mount

    // An outside ASK to open a desk (Axl's market-open card → the queued list). Keyed on the
    // request OBJECT, not its value: pressing the same card twice is two asks, and a plain
    // `deskRequest === 'queued'` dependency would fire only the first time — leaving the second
    // click looking broken after the user had closed the desk in between.
    // A PANEL desk asked for (a sector-view card → Forecasts; an "Open coverage" card → Forecasts on
    // that company) opens its panel instead of taking the column.
    useEffect(() => {
        if (!deskRequest?.key) return
        // Only a list this reader has: an admin's list asked for by anyone else opens nothing (and leaves no stale id).
        const panel = DESKS.find(d => d.key === deskRequest.key && !d.hidden && (!d.adminOnly || isAdmin))?.panel
        if (!panel) { setOpenKey(deskRequest.key); return }
        // Forecasts can be asked for ON a company (an Open coverage card) or an industry (Pythia's changed card).
        if (deskRequest.key === 'forecasts') setForecastFocus(deskRequest.symbol ? { symbol: deskRequest.symbol } : deskRequest.code ? { code: deskRequest.code } : null)
        openPanel(panel)
    }, [deskRequest]) // eslint-disable-line react-hooks/exhaustive-deps -- keyed on the request OBJECT (above); `isAdmin` is read as it arrives

    // Every count is the same thing: how many items are in the list. The header says how much is
    // here, the rows say what you can do about it.
    //
    // QUEUED USED TO COUNT ONLY `ready` ROWS, on the reasoning that a badge saying 3 when 1 is
    // pressable overstates the work. It backfired: things are queued precisely BECAUSE the venue is
    // shut, so off-hours every row is `ready:false` and the desk showed no count at all — silent at
    // the one moment it exists for. Readiness was never the header's job anyway; open the desk and
    // each row already carries its own dimmed dot and "waiting for the open".
    const counts = {
        positions:      book?.positions?.length ?? 0,
        queued:         queued.length,
        trade:          setups.length,
        portfolio:      portfoliosFromIdeas(ideas).length,
        scans:          scans.length,
        // Only queued items count — in_research is work the admin already started.
        research_queue: researchQueue.filter(i => i.status === 'queued').length,
        // One count per candidate ROW across every event in the window — a name three events
        // reached counts three times (its chip says ×3). The backend caps whole runs, never rows,
        // so this is the true count and not a ceiling: it read "(200)" once when it was a row cap.
        aether: (aetherCandidates?.runs ?? []).reduce((n, r) => n + (r.candidates?.length ?? 0), 0),
        // No count on Forecasts: it is a standing map rather than a list, and "(1)" beside
        // it would invite the reader to expect one. (Channels was the other, and went with
        // the channel engine on 2026-09-10.) Nor on Calendar: its counts are per day, in the grid.
    }

    // NOTHING AUTO-OPENS. There used to be an effect here that opened the first desk holding
    // any data. It contradicted the rule the accordion is built on, forty lines above: a fresh
    // load lands all-closed, because that is what makes the column a table of contents, and
    // opening a desk is a choice the reader makes rather than one a refresh makes for them.
    //
    // It also picked by list order, not by importance, so on any ordinary day it opened Queued
    // and buried the other eight behind it. Removed 2026-09-09; the fourteen tests it was
    // failing were right.

    // An `onRequest` desk (the board) joins the column only while it is the one asked for.
    const shown = DESKS.filter(d => !d.hidden && (!d.adminOnly || isAdmin))
    const visibleDesks = shown.filter(d => !d.onRequest || d.key === requestedKey || (d.panel && [activePanelId, underPanelId].includes(d.panel)))
    // Only a desk on screen can be open: an initialDesk or desk request naming a hidden (or
    // admin-only) desk would otherwise fold every header away around a desk that never renders.
    // A panel desk is never "open" in the column either — it has no body to give the column to.
    const openKey = visibleDesks.some(d => d.key === requestedKey && !d.panel) ? requestedKey : null

    const [sorts, setSorts] = useState(readSorts)
    const setSort = (key, sort) => setSorts(cur => {
        const next = { ...cur }
        if (sort) next[key] = sort
        else delete next[key]
        writeSorts(next)
        return next
    })
    const sorted = (key, rows) => sortRows(rows, key, sorts[key])

    // How many rows the SORT reorders — not always the header count: the research desk counts only
    // what is still queued, and the events desk counts names while it sorts events.
    const aetherRuns = aetherCandidates?.runs ?? []
    const sortableCount = {
        ...counts,
        research_queue: researchQueue.filter(i => i.status === 'queued' || i.status === 'in_research').length,
        aether:         aetherRuns.length,
    }

    // Empty = no ROWS to show, not a zero header count: the research desk counts only what is still
    // queued, so a backlog that is all in research would otherwise dim a desk full of rows. A feed
    // still loading is not "nothing here" yet, and Forecasts carries no count, so it is never dimmed.
    const loadingFor = { aether: aetherCandidates?.loading }
    const isEmpty = key => sortableCount[key] === 0 && !loadingFor[key]

    // A desk's rows — in its window over the chat (every list since 2026-10-22), or in the column for a desk without one.
    const deskBody = (desk) => (
        <>
            {DESK_SORTS[desk.key] && sortableCount[desk.key] > 1 && (
                <SortBar deskKey={desk.key} sort={sorts[desk.key]} onChange={s => setSort(desk.key, s)} />
            )}
            {desk.key === 'positions' && (
                <FloorLeft
                    positions={book?.positions ?? []}
                    ideas={book?.ideas ?? ideas}
                    positionsLoading={book?.loading ?? false}
                    onOpenPosition={book?.onOpenPosition}
                    onClosePosition={book?.onClosePosition}
                    onClosePositions={book?.onClosePositions}
                    onSymbolClick={onSymbolClick}
                />
            )}
            {desk.key === 'queued'    && (
                <QueuedRows
                    queued={sorted('queued', queued)}
                    onExecute={onExecuteQueued} onCancel={onCancelQueued}
                    busyId={queuedBusyId}
                />
            )}
            {desk.key === 'trade'     && (
                <TradeRows
                    onSymbolClick={onSymbolClick}
                    setups={sorted('trade', setups)}
                    onEditSetup={onEditSetup} onDeleteSetup={onDeleteSetup}
                />
            )}
            {desk.key === 'portfolio' && (
                <PortfolioRows
                    onSymbolClick={onSymbolClick}
                    ideas={ideas} positions={positions} sort={sorts.portfolio}
                    onEditPortfolio={onEditPortfolio} onDeletePortfolio={onDeletePortfolio}
                    onDeleteIdea={onDeleteIdea} onActivatePortfolio={onActivatePortfolio}
                />
            )}
            {desk.key === 'scans'     && (
                <ScanRows
                    onSymbolClick={onSymbolClick}
                    scans={sorted('scans', scans)} onCandidateSelect={onCandidateSelect}
                    onEditScan={onEditScan} onDeleteScan={onDeleteScan}
                />
            )}
            {desk.key === 'aether' && (
                <AetherCandidates
                    runs={sorted('aether', aetherRuns)}
                    loading={aetherCandidates?.loading}
                    error={aetherCandidates?.error}
                    onRead={aetherCandidates?.onRead}
                    onSymbolClick={onSymbolClick}
                    onTradeWithMentor={aetherCandidates?.onTradeWithMentor}
                    onScanWithArgus={aetherCandidates?.onScanWithArgus}
                    scanBusy={aetherCandidates?.scanBusy}
                    setups={setups}
                />
            )}

            {desk.key === 'board' && (
                <>
                    <button type="button" className="floor-board__map" onClick={() => openPanel(FORECAST_PANEL_ID)}>
                        Open the heat map
                    </button>
                    <IndustryView industries={industries} loading={industriesLoading} error={industriesError} assessments={assessments} themes={themes} week={week} />
                </>
            )}

            {desk.key === 'research_queue' && (
                <ResearchQueueRows
                    onSymbolClick={onSymbolClick}
                    researchQueue={sorted('research_queue', researchQueue)}
                    coverage={coverage}
                    onStartResearch={onStartResearch}
                    onMarkResearchDone={onMarkResearchDone}
                    onRejectResearch={onRejectResearch}
                    busyId={researchQueueBusyId}
                    researchRun={researchRun}
                    onStartResearchRun={onStartResearchRun}
                    onStopResearchRun={onStopResearchRun}
                    onRequeueStalledResearch={onRequeueStalledResearch}
                />
            )}
        </>
    )

    return (
        <aside className={`floor-lists${openKey ? ' floor-lists--focused' : ''}`}>
            {/* Same .floor-sec heading the left column uses, so all three columns open on one
                line across the app rather than three near-misses. */}
            <header className="floor-sec">
                {/* MENU (Roy, 2026-10-23): the left column, every list — Positions first. */}
                <h2 className="floor-sec__title">Menu</h2>
            </header>

            {openKey && (
                <DeskStrip desks={visibleDesks} openKey={openKey} activePanelId={activePanelId} counts={counts} isEmpty={isEmpty} onToggle={toggle} />
            )}

            {/* Always mounted: it renders nothing until its panel opens, and portals into the chat
                column when it does. */}
            <CalendarPanel onEarningSelect={onEarningSelect} onIpoSelect={onIpoSelect} onSymbolClick={onSymbolClick} />
            <HotlistPanel onBuild={onHotlistBuild} onAsk={onHotlistAsk} onSymbolClick={onSymbolClick} coverage={coverage} isAdmin={isAdmin} />
            <ForecastPanel coverage={coverage} themes={themes} focus={forecastFocus} onOpenBoard={() => openPanel('floor:board')}
                onEditCoverage={onEditCoverage} onRetireCoverage={onRetireCoverage} onDeleteCoverage={onDeleteCoverage} />
            {shown.filter(d => d.panel?.startsWith('floor:')).map(desk => (
                <ListPanel key={desk.key} desk={desk}>{deskBody(desk)}</ListPanel>
            ))}

            {visibleDesks.map(desk => (
                <Desk
                    key={desk.key}
                    desk={desk}
                    open={openKey === desk.key}
                    collapsed={!!openKey && openKey !== desk.key}
                    empty={isEmpty(desk.key)}
                    panelOpen={!!desk.panel && activePanelId === desk.panel}
                    count={counts[desk.key]}
                    onToggle={toggle}
                >
                    {!desk.panel && deskBody(desk)}
                </Desk>
            ))}
        </aside>
    )
}

FloorLists.propTypes = {
    onSymbolClick:     PropTypes.func,
    setups:            PropTypes.array,
    ideas:             PropTypes.array,
    positions:         PropTypes.array,
    scans:             PropTypes.array,
    coverage:          PropTypes.array,
    queued:            PropTypes.array,
    aetherCandidates:  PropTypes.shape({ runs: PropTypes.array, loading: PropTypes.bool, error: PropTypes.string, onTradeWithMentor: PropTypes.func, onScanWithArgus: PropTypes.func, scanBusy: PropTypes.bool }),
    onExecuteQueued:   PropTypes.func,
    onCancelQueued:    PropTypes.func,
    queuedBusyId:      PropTypes.string,
    deskRequest:       PropTypes.object,
    // The book, for the Positions window (FloorLeft's own props, from MainPage).
    book:              PropTypes.shape({
        positions: PropTypes.array, ideas: PropTypes.array, loading: PropTypes.bool,
        onOpenPosition: PropTypes.func, onClosePosition: PropTypes.func, onClosePositions: PropTypes.func,
    }),
    // Pythia's board (the `board` desk, opened from the map).
    industries:        PropTypes.array,
    industriesLoading: PropTypes.bool,
    industriesError:   PropTypes.bool,
    week:              PropTypes.object,
    assessments:       PropTypes.object,
    themes:            PropTypes.array,
    // Earnings / IPO rows on the Calendar's date page hand the event to Mentor (build a setup).
    onEarningSelect:     PropTypes.func,
    onIpoSelect:         PropTypes.func,
    onHotlistBuild:      PropTypes.func,
    onHotlistAsk:        PropTypes.func,
    onCandidateSelect:   PropTypes.func,
    onEditSetup:         PropTypes.func,
    onDeleteSetup:       PropTypes.func,
    onEditPortfolio:     PropTypes.func,
    onDeletePortfolio:   PropTypes.func,
    onActivatePortfolio: PropTypes.func,
    onDeleteIdea:        PropTypes.func,
    onEditScan:          PropTypes.func,
    onDeleteScan:        PropTypes.func,
    isAdmin:             PropTypes.bool,
    researchQueue:       PropTypes.array,
    onStartResearch:     PropTypes.func,
    onMarkResearchDone:  PropTypes.func,
    onRejectResearch:    PropTypes.func,
    researchQueueBusyId: PropTypes.string,
    researchRun:         PropTypes.object,
    onStartResearchRun:  PropTypes.func,
    onStopResearchRun:   PropTypes.func,
    onRequeueStalledResearch: PropTypes.func,
    initialDesk:         PropTypes.string,
}
