import { useState } from 'react'
import PropTypes from 'prop-types'
import {
    positionPnlPct, formatPnl, formatPnlPct, formatNum,
} from '../TradeIdeas/tradeIdea.utils.js'
import { positionsByAccount, groupByDay } from './floor.utils.js'
import { useExpandedSet } from '../../customHooks/useExpandedSet.js'
import { RowHost } from './RowHost.jsx'
import { IconButton } from '../EntityCard/IconButton.jsx'
import { CloseIcon } from '../EntityCard/entityIcons.jsx'
import { ClosePositionDialog } from '../TradeIdeas/ClosePositionDialog.jsx'
import './Floor.scss'

// The Floor's left column: the book on top, the calendar underneath.
//
// Both halves are the same shape — a quiet section header over one line per row — because both
// answer a background question ("what am I exposed to", "what is coming"). Neither is a place you
// act; acting happens in the chat or in the right column's lists. That's why there are no cards,
// no controls and no per-row chrome here: this column is READ, not operated.
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

const CAL_TABS = [
    { key: 'earnings', label: 'Earnings' },
    { key: 'fed',      label: 'Fed' },
    { key: 'ipo',      label: 'IPO' },
]

const pnlClass = n => (n == null ? '' : n > 0 ? 'is-pos' : n < 0 ? 'is-neg' : '')

// The one control this column carries: close at market. It rides in RowHost's overlay (a row IS a
// button, and a button can't contain one) and it is the SAME control the pop-out's position cards
// offer — same glyph, same tone, same confirm dialog — so a close is one thing wherever you meet it.
function closeAction({ onClose, closing, title }) {
    if (!onClose) return null
    return (
        <IconButton
            icon={closing ? <span className="floor-closing">…</span> : <CloseIcon />}
            tone="danger"
            size="sm"
            disabled={closing}
            onClick={onClose}
            title={title}
        />
    )
}

// One position. Shared by both tiers — a leg reads the same whether it hangs off the account or off
// a book; only its indent says which. `sub` is that indent and nothing else.
function PositionLine({ position: p, sub, onOpen, onClose, closing }) {
    const pct = positionPnlPct(p)
    return (
        <RowHost actions={closeAction({
            onClose: onClose && (() => onClose(p)),
            closing,
            title: 'Close this position at market',
        })}>
            <button
                className={`floor-pos${sub ? ' floor-pos--sub' : ''}`}
                onClick={() => onOpen?.(p)}
                title={onOpen ? 'Open this position' : undefined}
            >
                <span className={`floor-pos__dir floor-pos__dir--${p.direction}`} aria-hidden="true">
                    {p.direction === 'short' ? '▾' : '▴'}
                </span>
                <span className="floor-pos__sym">{p.symbol ?? '—'}</span>
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
}

const posKey = p => `${p.broker}:${p.accountId}:${p.id}`

function AccountBlock({ group, open, onToggle, onOpenPosition, onClosePosition, onCloseBook, closingKey }) {
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
                <span className="floor-acct__no">{group.accountNo}</span>
                {/* Beside the account number, in parens — the count says how big THIS account is,
                    so it reads as part of its name rather than as a column of its own. */}
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
                                {/* The book's close is the book's own action, not the sum of its legs':
                                    it closes every position under it in one confirm. Which is why it
                                    sits on the book row — the legs each keep their own. */}
                                <RowHost actions={closeAction({
                                    onClose: onCloseBook && (() => onCloseBook(book)),
                                    closing: closingKey === book.key,
                                    title: `Close all ${book.summary.count} position${book.summary.count === 1 ? '' : 's'} in this portfolio at market`,
                                })}>
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

                                {bookOpen && book.positions.map(p => (
                                    <PositionLine
                                        key={posKey(p)}
                                        position={p}
                                        sub
                                        onOpen={onOpenPosition}
                                        onClose={onClosePosition}
                                        closing={closingKey === posKey(p)}
                                    />
                                ))}
                            </div>
                        )
                    })}

                    {group.loose.map(p => (
                        <PositionLine
                            key={posKey(p)}
                            position={p}
                            onOpen={onOpenPosition}
                            onClose={onClosePosition}
                            closing={closingKey === posKey(p)}
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
    closingKey:      PropTypes.string,
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

function CalendarRows({ tab, earnings, fed, ipo, onEarningSelect, onIpoSelect }) {
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
                        key={e.symbol || i}
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
 * @param {Function} [onClosePosition]  (broker, id, accountId) => Promise — closes one at market
 * @param {Function} [onClosePositions] (targets[]) => Promise<{closed, failed}> — closes a book
 */
export function FloorLeft({
    positions = [], ideas = [], positionsLoading = false, onOpenPosition,
    onClosePosition, onClosePositions,
    earnings = [], fed = [], ipo = [], calendarLoading = false,
    onEarningSelect, onIpoSelect,
}) {
    const groups = positionsByAccount(positions, ideas)
    // Accounts default CLOSED, like every other list on the Floor — a refresh lands on a table of
    // contents and opens nothing on the reader's behalf. Same Set-toggle the books below use.
    const { isExpanded, toggle } = useExpandedSet()
    const [calTab, setCalTab] = useState('earnings')

    // Closing at market is the one thing this column does, and it never does it on a click alone:
    // the shared ClosePositionDialog reviews what's about to go (and gates it on the venue being
    // open) first. One position or a whole book — same dialog, same confirm.
    const [pending,    setPending]    = useState(null)   // {position} | {book}
    const [closingKey, setClosingKey] = useState(null)
    const [closeError, setCloseError] = useState(null)

    async function confirmClose() {
        if (!pending) return
        const { position, book } = pending
        setClosingKey(position ? posKey(position) : book.key)
        setCloseError(null)
        try {
            if (position) {
                await onClosePosition(position.broker, position.id, position.accountId)
                setPending(null)
                return
            }
            const { failed } = await onClosePositions(book.positions)
            if (!failed.length) { setPending(null); return }
            const names = failed.map(f => f.position.symbol ?? f.position.id).join(', ')
            setCloseError(`${failed.length} of ${book.positions.length} could not be closed: ${names}`)
            // Retry only what's still open, so a second confirm can't re-fire at legs that went through.
            setPending({ book: { ...book, positions: failed.map(f => f.position) } })
        } catch (err) {
            setCloseError(err?.message ?? 'Close failed')
        } finally {
            setClosingKey(null)
        }
    }

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
                                    onClosePosition={onClosePosition ? (p => setPending({ position: p })) : undefined}
                                    onCloseBook={onClosePositions ? (b => setPending({ book: b })) : undefined}
                                    closingKey={closingKey}
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
                            earnings={earnings} fed={fed} ipo={ipo}
                            onEarningSelect={onEarningSelect} onIpoSelect={onIpoSelect}
                        />}
                </div>
            </section>

            {pending && (
                <ClosePositionDialog
                    position={pending.position}
                    positions={pending.book?.positions}
                    label={pending.book?.name}
                    closing={closingKey != null}
                    error={closeError}
                    onConfirm={confirmClose}
                    onCancel={() => { setPending(null); setCloseError(null) }}
                />
            )}
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
    calendarLoading:  PropTypes.bool,
    onEarningSelect:  PropTypes.func,
    onIpoSelect:      PropTypes.func,
}
