import { useState } from 'react'
import PropTypes from 'prop-types'
import { groupByLifecycle } from '../../services/entityStatus.js'
import {
    openCallPopup, openSetupPopup, openIdeaPopup,
    portfoliosFromIdeas, portfolioPnl, formatPnl,
} from '../TradeIdeas/tradeIdea.utils.js'
import { tradeFloorItems } from './floor.utils.js'
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
                {count > 0 && <span className="floor-desk__count">{count}</span>}
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

// ── Trading floor ─────────────────────────────────────────────────────────────

function TradeRows({ calls, setups }) {
    const items = tradeFloorItems(calls, setups)
    if (!items.length) return <Empty>No calls or setups.</Empty>

    return groupByLifecycle(items).map(group => (
        <div key={group.key} className="floor-grp">
            <div className={`floor-grp__label floor-grp__label--${group.key}`}>{group.label}</div>
            {group.items.map(it => (
                <button
                    key={`${it.kind}:${it.id}`}
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
            ))}
        </div>
    ))
}
TradeRows.propTypes = { calls: PropTypes.array, setups: PropTypes.array }

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

function PortfolioRows({ ideas, positions }) {
    const books = portfoliosFromIdeas(ideas)
    const [open, setOpen] = useState(() => new Set())
    if (!books.length) return <Empty>No portfolios.</Empty>

    const toggle = id => setOpen(prev => {
        const next = new Set(prev)
        next.has(id) ? next.delete(id) : next.add(id)
        return next
    })

    return books.map(b => {
        const isOpen = open.has(b.portfolioId)
        const pnl    = portfolioPnl(b.ideas, positions)
        return (
            <div key={b.portfolioId} className="floor-sub">
                <button className="floor-row" onClick={() => toggle(b.portfolioId)} aria-expanded={isOpen}>
                    <span className="floor-row__sym floor-row__sym--wide">{b.name}</span>
                    <span className="floor-row__kind">{b.ideas.length} holdings</span>
                    <span className={`floor-row__pnl ${pnl?.pnl > 0 ? 'is-pos' : pnl?.pnl < 0 ? 'is-neg' : ''}`}>
                        {pnl ? formatPnl(pnl.pnl, pnl.currency) : '—'}
                    </span>
                </button>

                {isOpen && b.ideas.map(h => (
                    <button
                        key={h.id}
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
                ))}
            </div>
        )
    })
}
PortfolioRows.propTypes = { ideas: PropTypes.array, positions: PropTypes.array }

// ── Scans ─────────────────────────────────────────────────────────────────────
// A scan's row is its thesis; its candidates are the sub-rows. Expanding is local to the row, so
// several scans can be open at once — unlike the desks, these are peers being compared.

function ScanRows({ scans, onCandidateSelect }) {
    const [open, setOpen] = useState(() => new Set())
    if (!scans.length) return <Empty>No lists yet.</Empty>

    const toggle = id => setOpen(prev => {
        const next = new Set(prev)
        next.has(id) ? next.delete(id) : next.add(id)
        return next
    })

    return scans.map(s => {
        const isOpen = open.has(s.id)
        return (
            <div key={s.id} className="floor-sub">
                <button className="floor-row" onClick={() => toggle(s.id)} aria-expanded={isOpen}>
                    <span className={`floor-row__dir floor-row__dir--${s.direction}`} aria-hidden="true">
                        {s.direction === 'short' ? '▾' : '▴'}
                    </span>
                    <span className="floor-row__sym floor-row__sym--wide">{s.thesis}</span>
                    {s.stale && <span className="floor-row__stale">stale</span>}
                    <span className="floor-row__kind">{s.candidates?.length ?? 0}</span>
                </button>
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
ScanRows.propTypes = { scans: PropTypes.array, onCandidateSelect: PropTypes.func }

// ── Coverage ──────────────────────────────────────────────────────────────────

const RATING_LABEL = { strong_buy: 'strong buy', buy: 'buy', hold: 'hold', sell: 'sell', strong_sell: 'strong sell' }

const asList = (v) => (Array.isArray(v) ? v : [])
// Catalysts arrive as { date, note } or as a bare string, depending on how the thesis was written.
const catalystText = (k) => (typeof k === 'string' ? k : `${k?.date ? `${k.date}: ` : ''}${k?.note ?? ''}`)
const killText     = (k) => (typeof k === 'string' ? k : JSON.stringify(k))

function CoverageRows({ coverage }) {
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
CoverageRows.propTypes = { coverage: PropTypes.array }

// ── The column ────────────────────────────────────────────────────────────────

export function FloorLists({
    calls = [], setups = [], ideas = [], positions = [],
    scans = [], coverage = [],
    onCandidateSelect,
    initialDesk = 'trade',
}) {
    // One desk open at a time — clicking the open one closes it, leaving all four collapsed. That
    // "all closed" state is legitimate: it turns the column into a table of contents.
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
                    {desk.key === 'trade'     && <TradeRows calls={calls} setups={setups} />}
                    {desk.key === 'portfolio' && <PortfolioRows ideas={ideas} positions={positions} />}
                    {desk.key === 'scans'     && <ScanRows scans={scans} onCandidateSelect={onCandidateSelect} />}
                    {desk.key === 'coverage'  && <CoverageRows coverage={coverage} />}
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
    initialDesk:       PropTypes.string,
}
