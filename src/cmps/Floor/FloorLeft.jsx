import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import { eventBus, OPEN_SECTOR_VIEW } from '../../services/event-bus.service'
import { SectorView } from '../Radar/SectorView.jsx'
import {
    positionPnlPct, formatPnl, formatPnlPct, formatNum,
} from '../TradeIdeas/tradeIdea.utils.js'
import { positionsByAccount, groupByDay } from './floor.utils.js'
import { usePositionClose } from '../TradeIdeas/usePositionClose.jsx'
import { posKey } from '../TradeIdeas/PositionsTable.jsx'
import { useExpandedSet } from '../../customHooks/useExpandedSet.js'
import { IconButton } from '../EntityCard/IconButton.jsx'
import { CloseIcon } from '../EntityCard/entityIcons.jsx'
import { RowHost } from './RowHost.jsx'
import './Floor.scss'

// The Floor's left column: the book on top, the calendar underneath.
//
// Both halves are the same shape — a quiet section header over one line per row — because both
// answer a background question ("what am I exposed to", "what is coming"). There are no cards and
// no per-row chrome here: this column is READ first.
//
// ONE exception, and it is the whole reason the column exists: CLOSING. A leg carries a ✕ and a
// book carries a ✕ that closes every leg under it, both revealed on hover like every other Floor
// row action. They were left off when the book moved here — the reasoning was that acting belongs
// in the Positions tab — but the Floor REPLACED that tab, so the only way out of a position became
// a pop-out window opened from a row, and a position you can't close from the surface that shows it
// is the one control a book must never hide. It stays hover-revealed, not resting: reading the book
// is still the common act, and a ✕ per line at rest reads as a list of things to dismiss.
//
// Positions are grouped by ACCOUNT first. A portfolio is a construction; an account is where the
// money actually is, and exposure is an account-level question. Accounts data (balance, equity,
// margin) lands here later — the account row is already the seam for it.
//
// Inside an account, a book gets its own row before its legs do. Fifteen holdings listed flat under
// an account is fifteen lines you have to read to find the one fact you wanted — "how is the book
// doing" — which is a fact the legs don't state anywhere. So the tiers are account → book → leg,
// and only the leg tier is a position. Positions that belong to no book stay directly on the
// account: inventing a "Standalone" wrapper for them would add a row that groups nothing.

// Earnings / Fed / IPO are SCHEDULES — things that happen on a date. Forecasts is a STATE: the house
// sector view in force. It sits here anyway because this is where the user looks for "what is coming
// and what do we think", and splitting that across two surfaces just hides one of them.
const CAL_TABS = [
    { key: 'earnings',  label: 'Earnings' },
    { key: 'fed',       label: 'Fed' },
    { key: 'ipo',       label: 'IPO' },
    { key: 'forecasts', label: 'Forecasts' },
]

const pnlClass = n => (n == null ? '' : n > 0 ? 'is-pos' : n < 0 ? 'is-neg' : '')

// The ✕ that closes at market — one leg or a whole book. Same glyph, same danger tone and the same
// in-flight "…" the position CARDS use, because it is the same act on the same entity; only the
// title says how much of the book it takes with it.
function CloseAtMarketButton({ onClick, title, closing }) {
    return (
        <IconButton
            icon={closing ? <span aria-hidden="true">…</span> : <CloseIcon />}
            tone="danger"
            size="sm"
            disabled={closing}
            onClick={onClick}
            title={title}
        />
    )
}
CloseAtMarketButton.propTypes = { onClick: PropTypes.func.isRequired, title: PropTypes.string, closing: PropTypes.bool }

// One position. Shared by both tiers — a leg reads the same whether it hangs off the account or off
// a book; only its indent says which. `sub` is that indent and nothing else.
//
// The row is a <button>, so the ✕ can't live inside it — it rides in the RowHost overlay, exactly
// like the right column's edit/delete.
function PositionLine({ position: p, sub, onOpen, onClose, closing, expanded, onToggle }) {
    const pct = positionPnlPct(p)
    // FOLDED: this line stands for a holding held as several broker positions, at the blended
    // average. Clicking it opens the legs rather than the entity — the caret IS the row — and its ✕
    // takes the whole holding, since "close MU" has never meant one arbitrary leg of it.
    const folded = !!onToggle
    return (
        <RowHost
            actions={onClose && (
                <CloseAtMarketButton
                    onClick={() => onClose(p)}
                    closing={closing}
                    title={folded
                        ? `Close all ${p.legs?.length ?? 0} ${p.symbol ?? ''} positions at market`
                        : `Close ${p.symbol ?? 'this position'} at market`}
                />
            )}
        >
            <button
                className={`floor-pos${sub ? ' floor-pos--sub' : ''}${folded ? ' floor-pos--folded' : ''}`}
                onClick={() => (folded ? onToggle() : onOpen?.(p))}
                aria-expanded={folded ? !!expanded : undefined}
                title={folded
                    ? (expanded ? 'Collapse this holding' : `${p.legs?.length ?? 0} positions — blended average`)
                    : (onOpen ? 'Open this position' : undefined)}
            >
                <span className={`floor-pos__dir floor-pos__dir--${p.direction}`} aria-hidden="true">
                    {p.direction === 'short' ? '▾' : '▴'}
                </span>
                <span className="floor-pos__sym">
                    {p.symbol ?? '—'}
                    {folded && <span className="floor-pos__legs">×{p.legs?.length ?? 0}</span>}
                </span>
                <span className="floor-pos__qty">{formatNum(p.volume)}</span>
                <span className={`floor-pos__pnl ${pnlClass(Number(p.pnl))}`}>
                    {formatPnl(p.pnl, p.currency)}
                </span>
                <span className={`floor-pos__pct ${pnlClass(pct)}`}>{formatPnlPct(pct)}</span>
            </button>
        </RowHost>
    )
}

PositionLine.propTypes = {
    position: PropTypes.object.isRequired,
    sub:      PropTypes.bool,
    onOpen:   PropTypes.func,
    onClose:  PropTypes.func,
    closing:  PropTypes.bool,
    expanded: PropTypes.bool,
    onToggle: PropTypes.func,
}

/**
 * One HOLDING's lines: a single leg renders as the plain row it always did; several legs render as
 * one blended row that expands into them.
 *
 * `group` is a foldHoldingLegs() entry. `onCloseHolding` takes the whole holding in one confirm — the
 * same act as the book ✕ one tier up, on a smaller set — and per-leg ✕s stay on the expanded rows so
 * a deliberate single-leg close is still possible.
 */
function HoldingLines({ group, sub, expanded, onToggle, onOpenPosition, onClosePosition, onCloseHolding, closingId, closingGroupId }) {
    if (group.legs.length === 1) {
        const p = group.position
        return (
            <PositionLine
                position={p}
                sub={sub}
                onOpen={onOpenPosition}
                onClose={onClosePosition}
                closing={closingId === posKey(p)}
            />
        )
    }
    const key = `holding:${group.ownerId}`
    return (
        <>
            <PositionLine
                position={group.position}
                sub={sub}
                expanded={expanded}
                onToggle={onToggle}
                closing={closingGroupId === key}
                onClose={onCloseHolding && (() => onCloseHolding({
                    key,
                    label:     group.position.symbol ?? 'holding',
                    positions: group.legs,
                }))}
            />
            {expanded && group.legs.map(p => (
                <PositionLine
                    key={posKey(p)}
                    position={p}
                    sub
                    onOpen={onOpenPosition}
                    onClose={onClosePosition}
                    closing={closingId === posKey(p)}
                />
            ))}
        </>
    )
}

HoldingLines.propTypes = {
    group:           PropTypes.object.isRequired,
    sub:             PropTypes.bool,
    expanded:        PropTypes.bool,
    onToggle:        PropTypes.func.isRequired,
    onOpenPosition:  PropTypes.func,
    onClosePosition: PropTypes.func,
    onCloseHolding:  PropTypes.func,
    closingId:       PropTypes.string,
    closingGroupId:  PropTypes.string,
}

// posKey comes from PositionsTable rather than being re-derived here: it is what the close flow
// stamps as the in-flight id, and a local copy that spelled a missing accountId differently would
// leave the spinner on a row that is closing.

function AccountBlock({ group, open, onToggle, onOpenPosition, onClosePosition, onCloseBook, closingId, closingGroupId }) {
    const { summary } = group
    // Books start CLOSED, like the account above them: a portfolio row exists precisely to stand in
    // for its legs, so opening it for you would undo the row.
    const { isExpanded, toggle } = useExpandedSet()
    return (
        <div className={`floor-acct${open ? ' floor-acct--open' : ''}`}>
            <button
                className="floor-acct__row"
                onClick={() => onToggle(group.key)}
                aria-expanded={open}
                title={open ? 'Collapse account' : 'Expand account'}
            >
                <svg className="floor-acct__chev" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {/* No paper/manual/live chip: usePositions already scopes the whole list to the
                    active workspace, so every row here is that mode by construction. A per-row
                    badge would be restating the workspace switch on every line. */}
                {/* Titled with itself: a live account shows a number, and a virtual one whose
                    name is long (or that has no name to fall back on, leaving its id) truncates —
                    and the tail has to stay readable somewhere. */}
                <span className="floor-acct__no" title={group.accountLabel}>{group.accountLabel}</span>
                {/* Beside the account number, in parens — the count says how big THIS account is,
                    so it reads as part of its name rather than as a column of its own. And it never
                    leaves that side: the number truncates instead of pushing the count off. */}
                <span className="floor-acct__count">({summary.count})</span>
                <span className={`floor-acct__pnl ${pnlClass(summary.pnl)}`}>
                    {summary.pnl == null ? '—' : formatPnl(summary.pnl, summary.currency)}
                </span>
            </button>

            {open && (
                <div className="floor-acct__body">
                    {/* Books first, then the standalone legs — a grouped row is a heading, and
                        headings don't come after the loose items they aren't heading. */}
                    {group.books.map(book => {
                        const bookOpen = isExpanded(book.key)
                        return (
                            <div key={book.key} className={`floor-book${bookOpen ? ' floor-book--open' : ''}`}>
                                {/* The book's ✕ closes the BOOK — every leg under it, in one confirm.
                                    It is not the sum of the legs' buttons: a book is entered as one
                                    construction, and exiting it one leg at a time leaves a portfolio
                                    that no longer matches the thesis it was built on. */}
                                <RowHost
                                    actions={onCloseBook && book.positions.length > 0 && (
                                        <CloseAtMarketButton
                                            onClick={() => onCloseBook({
                                                key:       book.key,
                                                label:     book.name,
                                                positions: book.positions,
                                            })}
                                            closing={closingGroupId === book.key}
                                            title={`Close all ${book.positions.length} position${book.positions.length === 1 ? '' : 's'} in ${book.name} at market`}
                                        />
                                    )}
                                >
                                    <button
                                        className="floor-book__row"
                                        onClick={() => toggle(book.key)}
                                        aria-expanded={bookOpen}
                                        title={bookOpen ? 'Collapse portfolio' : 'Expand portfolio'}
                                    >
                                        <svg className="floor-book__chev" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                            <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                        </svg>
                                        <span className="floor-book__name">{book.name}</span>
                                        {/* Same parenthetical-beside-the-name rule the account row uses. */}
                                        <span className="floor-book__count">({book.summary.count})</span>
                                        <span className={`floor-book__pnl ${pnlClass(book.summary.pnl)}`}>
                                            {book.summary.pnl == null ? '—' : formatPnl(book.summary.pnl, book.summary.currency)}
                                        </span>
                                    </button>
                                </RowHost>

                                {/* One line per HOLDING, not per broker position — a holding sitting
                                    behind two positions (a hedging venue's scale-in) is one line at
                                    the blended average, which expands to its legs. */}
                                {bookOpen && book.rows.map(g => (
                                    <HoldingLines
                                        key={g.ownerId ?? posKey(g.position)}
                                        group={g}
                                        sub
                                        expanded={isExpanded(`holding:${g.ownerId}`)}
                                        onToggle={() => toggle(`holding:${g.ownerId}`)}
                                        onOpenPosition={onOpenPosition}
                                        onClosePosition={onClosePosition}
                                        onCloseHolding={onCloseBook}
                                        closingId={closingId}
                                        closingGroupId={closingGroupId}
                                    />
                                ))}
                            </div>
                        )
                    })}

                    {group.looseRows.map(g => (
                        <HoldingLines
                            key={g.ownerId ?? posKey(g.position)}
                            group={g}
                            expanded={isExpanded(`holding:${g.ownerId}`)}
                            onToggle={() => toggle(`holding:${g.ownerId}`)}
                            onOpenPosition={onOpenPosition}
                            onClosePosition={onClosePosition}
                            onCloseHolding={onCloseBook}
                            closingId={closingId}
                            closingGroupId={closingGroupId}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

AccountBlock.propTypes = {
    group:           PropTypes.object.isRequired,
    open:            PropTypes.bool,
    onToggle:        PropTypes.func.isRequired,
    onOpenPosition:  PropTypes.func,
    onClosePosition: PropTypes.func,
    onCloseBook:     PropTypes.func,
    closingId:       PropTypes.string,
    closingGroupId:  PropTypes.string,
}

// ── Calendar ──────────────────────────────────────────────────────────────────
// One row per event, grouped by day. The three feeds differ in what they carry, so each renders
// its own row — but the day grouping and the header are shared, because that part is mechanism.

const MONTHS   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function fmtDay(iso) {
    if (!iso) return ''
    const [y, m, d] = iso.split('-').map(Number)
    if (!y || !m || !d) return iso
    const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
    return `${wd} ${MONTHS[m - 1]} ${d}`
}

const EARN_WHEN = { bmo: 'Pre', amc: 'Post', dmh: 'Mid' }

function CalendarRows({ tab, earnings, fed, ipo, tilt, onEarningSelect, onIpoSelect }) {
    // The house view is not a dated list, so it renders its own board rather than being forced
    // through groupByDay — see SectorView.
    if (tab === 'forecasts') return <SectorView tilt={tilt} />
    const items = tab === 'earnings' ? earnings : tab === 'fed' ? fed : ipo
    if (!items.length) return <p className="floor-empty">Nothing scheduled.</p>

    return groupByDay(items).map(g => (
        <div key={g.date} className="floor-cal__day">
            <div className="floor-cal__date">{fmtDay(g.date)}</div>
            {g.items.map((e, i) => {
                if (tab === 'fed') {
                    return (
                        <div key={i} className="floor-cal__row" title={e.desc || ''}>
                            <span className="floor-cal__time">{e.time || ''}</span>
                            <span className="floor-cal__label">{e.event}</span>
                            <span className={`floor-cal__impact floor-cal__impact--${e.impact}`}>{e.impact}</span>
                        </div>
                    )
                }
                const onSelect = tab === 'earnings' ? onEarningSelect : onIpoSelect
                return (
                    <button
                        key={`${e.symbol || 'row'}-${i}`}
                        className="floor-cal__row floor-cal__row--btn"
                        onClick={() => onSelect?.(e)}
                        title={e.symbol ? `Build a setup around ${e.symbol}` : undefined}
                    >
                        <span className="floor-cal__sym">{e.symbol ?? '—'}</span>
                        <span className="floor-cal__label">{e.name ?? ''}</span>
                        {tab === 'earnings'
                            ? <span className="floor-cal__when">{EARN_WHEN[(e.time || '').toLowerCase()] ?? ''}</span>
                            : <span className="floor-cal__when">{e.price ? `$${e.price}` : ''}</span>}
                    </button>
                )
            })}
        </div>
    ))
}

/**
 * @param {object[]} positions
 * @param {object[]} [ideas]            loaded ideas — the position→portfolio link for the book tier
 * @param {Function} [onOpenPosition]   row click — hands the position back to the caller
 * @param {Function} [onClosePosition]  (broker, positionId, accountId) => Promise — omit and no leg
 *                                      gets a ✕ (the column goes read-only, as it shipped)
 * @param {Function} [onClosePositions] (positions[]) => Promise<{closed, failed}> — the book ✕
 */
export function FloorLeft({
    positions = [], ideas = [], positionsLoading = false, onOpenPosition,
    onClosePosition, onClosePositions,
    earnings = [], fed = [], ipo = [], tilt = null, calendarLoading = false,
    onEarningSelect, onIpoSelect,
}) {
    const groups = positionsByAccount(positions, ideas)
    // The confirm-and-fire flow is the Positions tab's, verbatim — see usePositionClose.
    const { requestClose, requestCloseGroup, closingId, closingGroupId, closeDialog } =
        usePositionClose({ onClosePosition, onClosePositions })
    // Accounts default CLOSED, like every other list on the Floor — a refresh lands on a table of
    // contents and opens nothing on the reader's behalf. Same Set-toggle the books below use.
    const { isExpanded, toggle } = useExpandedSet()
    const [calTab, setCalTab] = useState('earnings')
    // A sector-view card opens the board. This rail owns its own tab state, so it subscribes here
    // rather than having calTab lifted to MainPage purely to be handed straight back down.
    useEffect(() => eventBus.on(OPEN_SECTOR_VIEW, () => setCalTab('forecasts')), [])

    return (
        <aside className="floor-left">
            {/* ── The book ── */}
            <section className="floor-left__half floor-left__half--book">
                {/* Title only. The roll-up P&L that used to sit here is deliberately gone: the
                    per-account rows below already carry it, and a second total in the header
                    invited the reader to reconcile two numbers instead of reading one. */}
                <header className="floor-sec">
                    <h2 className="floor-sec__title">Positions</h2>
                </header>

                <div className="floor-left__scroll">
                    {positionsLoading && !positions.length
                        ? <p className="floor-empty">Loading…</p>
                        : !groups.length
                            ? <p className="floor-empty">No open positions.</p>
                            : groups.map(g => (
                                <AccountBlock
                                    key={g.key}
                                    group={g}
                                    open={isExpanded(g.key)}
                                    onToggle={toggle}
                                    onOpenPosition={onOpenPosition}
                                    onClosePosition={requestClose}
                                    onCloseBook={requestCloseGroup}
                                    closingId={closingId}
                                    closingGroupId={closingGroupId}
                                />
                            ))}
                </div>
            </section>

            {/* ── The calendar ── */}
            <section className="floor-left__half floor-left__half--cal">
                <header className="floor-sec">
                    <h2 className="floor-sec__title">Calendar</h2>
                    <nav className="floor-sec__tabs">
                        {CAL_TABS.map(t => (
                            <button
                                key={t.key}
                                className={`floor-sec__tab${calTab === t.key ? ' floor-sec__tab--on' : ''}`}
                                onClick={() => setCalTab(t.key)}
                            >{t.label}</button>
                        ))}
                    </nav>
                </header>

                <div className="floor-left__scroll">
                    {calendarLoading
                        ? <p className="floor-empty">Loading…</p>
                        : <CalendarRows
                            tab={calTab}
                            earnings={earnings} fed={fed} ipo={ipo} tilt={tilt}
                            onEarningSelect={onEarningSelect} onIpoSelect={onIpoSelect}
                        />}
                </div>
            </section>

            {closeDialog}
        </aside>
    )
}

FloorLeft.propTypes = {
    positions:        PropTypes.array,
    ideas:            PropTypes.array,
    positionsLoading: PropTypes.bool,
    onOpenPosition:   PropTypes.func,
    onClosePosition:  PropTypes.func,
    onClosePositions: PropTypes.func,
    earnings:         PropTypes.array,
    fed:              PropTypes.array,
    ipo:              PropTypes.array,
    tilt:             PropTypes.object,
    calendarLoading:  PropTypes.bool,
    onEarningSelect:  PropTypes.func,
    onIpoSelect:      PropTypes.func,
}
