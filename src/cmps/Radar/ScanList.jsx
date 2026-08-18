import { useState } from 'react'
import PropTypes from 'prop-types'
import { EditButton, DeleteButton } from '../EntityCard/EntityCard.jsx'
import { ConvictionChip } from '../ConvictionChip/ConvictionChip.jsx'
import { RadarTicker } from './RadarTicker.jsx'
import './ScanList.scss'

// Collapse state persists in sessionStorage so folding lists then switching to the
// News tab (which unmounts ScanList) doesn't reset everything back to expanded.
// Keys are stable period keys / scan ids, so they survive across remounts.
const COLLAPSE_KEY = 'scanList.collapsed'

function loadCollapsed() {
    try {
        const raw = sessionStorage.getItem(COLLAPSE_KEY)
        const data = raw ? JSON.parse(raw) : {}
        return {
            periods: new Set(data.periods || []),
            cards: new Set(data.cards || []),
        }
    } catch {
        return { periods: new Set(), cards: new Set() }
    }
}

function saveCollapsed(periods, cards) {
    try {
        sessionStorage.setItem(COLLAPSE_KEY, JSON.stringify({
            periods: [...periods],
            cards: [...cards],
        }))
    } catch { /* storage unavailable — fall back to in-memory state only */ }
}

// Parse a 'YYYY-MM-DD' string as a local date (avoids the UTC-midnight day shift).
function parseDay(ymd) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
    const [y, m, d] = ymd.split('-').map(Number)
    return new Date(y, m - 1, d)
}

function fmtDay(ymd) {
    const d = parseDay(ymd)
    if (!d) return ''
    const sameYear = d.getFullYear() === new Date().getFullYear()
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
}

function fmtRange(start, end) {
    if (!start && !end) return ''
    if (start && end && start !== end) return `${fmtDay(start)} – ${fmtDay(end)}`
    return fmtDay(start || end)
}

// Lists are grouped by their resolved period — period is the primary axis the
// user reads first ("when is this relevant?"), thesis second. The key is the
// resolved date span so lists for the same window stack together.
function periodKey(p) {
    if (!p || (!p.start && !p.end)) return 'undated'
    return `${p.start || ''}|${p.end || ''}`
}

// Header for a period group: bold label (agent's wording or the date range) plus
// a muted date range underneath when a label is present.
function periodHeader(p) {
    const range = fmtRange(p?.start, p?.end)
    if (!p || (!p.start && !p.end && !p.label)) return { title: 'Undated', sub: '' }
    if (p.label && range) return { title: p.label, sub: range }
    return { title: p.label || range, sub: '' }
}

// True when today falls inside the period's window (start ≤ today ≤ end) — i.e. the
// scan is live right now, not merely upcoming or past. Open-ended bounds count as
// satisfied on that side; a fully undated period is never "current".
function isCurrentPeriod(p) {
    if (!p || (!p.start && !p.end)) return false
    const today = new Date().toISOString().slice(0, 10)
    return (!p.start || p.start <= today) && (!p.end || today <= p.end)
}

// True when the period's window has fully elapsed (its end is before today) — the
// scan is stale. Undated periods are never "past".
function isPastPeriod(p) {
    if (!p || (!p.start && !p.end)) return false
    const today = new Date().toISOString().slice(0, 10)
    const end = p.end || p.start
    return end < today
}

// Order groups by time-relevance: current/upcoming first (soonest start first),
// then fully-past windows (most recent first), then undated.
function groupRank(p) {
    const today = new Date().toISOString().slice(0, 10)
    if (!p || (!p.start && !p.end)) return { tier: 2, key: '' }
    const end = p.end || p.start
    if (end < today) return { tier: 1, key: p.start || end }   // past
    return { tier: 0, key: p.start || end }                    // active / upcoming
}

function compareGroups(a, b) {
    const ra = groupRank(a.period), rb = groupRank(b.period)
    if (ra.tier !== rb.tier) return ra.tier - rb.tier
    if (ra.tier === 1) return rb.key.localeCompare(ra.key)     // past: most recent first
    return ra.key.localeCompare(rb.key)                        // upcoming: soonest first
}

// The transparent scorecard: four component axes shown as labeled bars in the
// candidate detail. `total` rides on the row as a badge (see ScoreBadge). Order is
// fixed so the eye can compare names down the list; missing components are skipped.
const SCORE_AXES = [
    ['catalyst',         'Catalyst'],
    ['technical',        'Technical'],
    ['relativeStrength', 'Rel. strength'],
    ['liquidity',        'Liquidity'],
]
// Investing profile (Argus P4a): a fundamental scorecard instead of the trade axes.
const INVESTING_AXES = [
    ['quality',       'Quality'],
    ['valuation',     'Valuation'],
    ['growth',        'Growth'],
    ['balance_sheet', 'Balance sheet'],
]
const axesFor = profile => (profile === 'investing' ? INVESTING_AXES : SCORE_AXES)

// Green ≥75, amber 55–74, red <55 — same bands the agent maps to conviction level.
function scoreTier(v) {
    if (!Number.isFinite(v)) return 'na'
    if (v >= 75) return 'high'
    if (v >= 55) return 'mid'
    return 'low'
}

function ScoreBadge({ total }) {
    if (!Number.isFinite(total)) return null
    return (
        <span className={`scan-list__score-badge scan-list__score-badge--${scoreTier(total)}`} title="Composite setup score (0–100)">
            {total}
        </span>
    )
}

function ScoreBars({ score, profile }) {
    const axes = axesFor(profile).filter(([k]) => Number.isFinite(score?.[k]))
    if (!axes.length) return null
    return (
        <div className="scan-list__scorecard">
            {axes.map(([k, label]) => {
                const v = score[k]
                return (
                    <div key={k} className="scan-list__score-row">
                        <span className="scan-list__score-label">{label}</span>
                        <span className="scan-list__score-track">
                            <span className={`scan-list__score-fill scan-list__score-fill--${scoreTier(v)}`} style={{ width: `${v}%` }} />
                        </span>
                        <span className="scan-list__score-val">{v}</span>
                    </div>
                )
            })}
        </div>
    )
}

function Candidate({ c, onSelect, profile }) {
    const [open, setOpen] = useState(false)
    const signals = c.signals || {}
    const hasScoreBars = axesFor(profile).some(([k]) => Number.isFinite(c.score?.[k]))
    const hasDetail = c.analysis || c.conviction?.rationale || hasScoreBars || Object.values(signals).some(Boolean) || (c.sources?.length > 0)

    return (
        <div className="scan-list__cand">
            <div className="scan-list__cand-row">
                <span className={`scan-list__dir scan-list__dir--${c.direction}`}>
                    {c.direction === 'short' ? '▾' : '▴'}
                </span>
                <RadarTicker
                    symbol={c.ticker}
                    name={c.name}
                    logo={c.logo}
                    onSelect={() => onSelect?.(c)}
                    title={profile === 'investing' ? 'Research this in the Analyst' : 'Build a setup from this in Mentor'}
                />
                <span className="scan-list__cand-thesis">{c.thesis}</span>
                <ScoreBadge total={c.score?.total} />
                <ConvictionChip conviction={c.conviction} />
                {hasDetail && (
                    <button
                        className={`scan-list__expand${open ? ' scan-list__expand--open' : ''}`}
                        onClick={() => setOpen(o => !o)}
                        aria-label={open ? 'Collapse' : 'Expand'}
                        title={open ? 'Hide details' : 'Show details'}
                    >
                        <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                            <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </button>
                )}
            </div>

            {open && (
                <div className="scan-list__cand-detail">
                    {c.analysis && <p className="scan-list__analysis">{c.analysis}</p>}
                    <ScoreBars score={c.score} profile={profile} />
                    {c.conviction?.rationale && (
                        <p className="scan-list__analysis scan-list__conviction-why">
                            <ConvictionChip conviction={c.conviction} /> {c.conviction.rationale}
                        </p>
                    )}
                    {Object.entries(signals).filter(([, v]) => v).map(([k, v]) => (
                        <div key={k} className="scan-list__signal">
                            <span className="scan-list__signal-key">{k}</span>
                            <span className="scan-list__signal-val">{v}</span>
                        </div>
                    ))}
                    {c.sources?.length > 0 && (
                        <div className="scan-list__sources">
                            {c.sources.map((s, i) => (
                                <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="scan-list__source">
                                    {s.title || s.url}
                                </a>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

function ScanCard({ scan, collapsed, onToggle, onCandidateSelect, onDelete, onEditScan }) {
    const dir = scan.direction
    return (
        <div className={`scan-list__card${collapsed ? ' scan-list__card--collapsed' : ''}`}>
            <div
                className="scan-list__card-header"
                onClick={() => onToggle?.(scan.id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle?.(scan.id) } }}
                aria-expanded={!collapsed}
                title={collapsed ? 'Expand thesis' : 'Collapse thesis'}
            >
                <span className={`scan-list__caret${collapsed ? ' scan-list__caret--collapsed' : ''}`} aria-hidden="true">
                    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </span>
                <span className="scan-list__thesis">{scan.thesis}</span>
                {scan.stale && (
                    <span className="scan-list__stale" title="This list's period has passed — it may be out of date">stale</span>
                )}
                <span className={`scan-list__card-dir scan-list__card-dir--${dir}`}>{dir}</span>
                <span className="scan-list__count">{scan.candidates.length}</span>
                {/* The shared controls — this card used to re-inline the pencil and bin paths,
                    so the glyphs could drift from every other list in the app. */}
                <EditButton onClick={() => onEditScan?.(scan)} title="Edit this list in the scanner chat" size="sm" />
                <DeleteButton onClick={() => onDelete?.(scan.id)} title="Delete list" size="sm" className="scan-list__delete" />
            </div>
            {!collapsed && (
                <div className="scan-list__cands">
                    {scan.candidates.map(c => (
                        <Candidate key={c.ticker} c={c} profile={scan.profile} onSelect={(cand) => onCandidateSelect?.(cand, scan)} />
                    ))}
                </div>
            )}
        </div>
    )
}

export function ScanList({ scans = [], loading, onCandidateSelect, onDelete, onEditScan }) {
    // Collapse state — periods (category) and thesis cards (subcategory) both fold.
    // Default expanded; we only track the collapsed ones. Seeded from (and synced
    // to) sessionStorage so it survives leaving and re-entering the Scans tab.
    const [collapsedPeriods, setCollapsedPeriods] = useState(() => loadCollapsed().periods)
    const [collapsedCards,   setCollapsedCards]   = useState(() => loadCollapsed().cards)

    function togglePeriod(key) {
        setCollapsedPeriods(prev => {
            const next = new Set(prev)
            next.has(key) ? next.delete(key) : next.add(key)
            saveCollapsed(next, collapsedCards)
            return next
        })
    }
    function toggleCard(id) {
        setCollapsedCards(prev => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            saveCollapsed(collapsedPeriods, next)
            return next
        })
    }

    if (loading) {
        return <div className="scan-list__loader"><span /><span /><span /></div>
    }
    if (!scans.length) {
        return <p className="scan-list__empty">No lists yet. Ask the Scanner what to watch, then Generate a list.</p>
    }

    // Group lists by their resolved period; the period is the group header and
    // theses (cards) nest under it. Scans arrive newest-first (savedAt), preserved
    // within each group.
    const byPeriod = new Map()
    for (const s of scans) {
        const key = periodKey(s.period)
        if (!byPeriod.has(key)) byPeriod.set(key, { period: s.period, items: [] })
        byPeriod.get(key).items.push(s)
    }
    const groups = [...byPeriod.values()].sort(compareGroups)

    return (
        <div className="scan-list">
            {groups.map(group => {
                const { title, sub } = periodHeader(group.period)
                const key = periodKey(group.period)
                const periodCollapsed = collapsedPeriods.has(key)
                const current = isCurrentPeriod(group.period)
                const past    = !current && isPastPeriod(group.period)
                return (
                    <div key={key} className={`scan-list__group${periodCollapsed ? ' scan-list__group--collapsed' : ''}`}>
                        <div
                            className="scan-list__group-label"
                            onClick={() => togglePeriod(key)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePeriod(key) } }}
                            aria-expanded={!periodCollapsed}
                            title={periodCollapsed ? 'Expand period' : 'Collapse period'}
                        >
                            <span className={`scan-list__caret${periodCollapsed ? ' scan-list__caret--collapsed' : ''}`} aria-hidden="true">
                                <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </span>
                            <span className={`scan-list__group-period${current ? ' scan-list__group-period--current' : ''}${past ? ' scan-list__group-period--past' : ''}`}>{title}</span>
                            {past && (
                                <span className="scan-list__group-stale" title="This scan's window has passed" aria-label="window passed">
                                    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                        <path d="M8 2.2L14.5 13.3H1.5L8 2.2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                                        <path d="M8 6.4V9.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                                        <circle cx="8" cy="11.4" r="0.5" fill="currentColor"/>
                                    </svg>
                                </span>
                            )}
                            {sub && <span className="scan-list__group-range">{sub}</span>}
                            <span className="scan-list__group-count">{group.items.length}</span>
                        </div>
                        {!periodCollapsed && group.items.map(scan => (
                            <ScanCard
                                key={scan.id}
                                scan={scan}
                                collapsed={collapsedCards.has(scan.id)}
                                onToggle={toggleCard}
                                onCandidateSelect={onCandidateSelect}
                                onDelete={onDelete}
                                onEditScan={onEditScan}
                            />
                        ))}
                    </div>
                )
            })}
        </div>
    )
}

ScanList.propTypes = {
    scans:             PropTypes.array,
    loading:           PropTypes.bool,
    onCandidateSelect: PropTypes.func,
    onDelete:          PropTypes.func,
    onEditScan:        PropTypes.func,
}
