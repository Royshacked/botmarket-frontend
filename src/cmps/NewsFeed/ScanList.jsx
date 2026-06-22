import { useState } from 'react'
import PropTypes from 'prop-types'
import './ScanList.scss'

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

function Candidate({ c, onSelect }) {
    const [open, setOpen] = useState(false)
    const signals = c.signals || {}
    const hasDetail = c.analysis || Object.values(signals).some(Boolean) || (c.sources?.length > 0)

    return (
        <div className="scan-list__cand">
            <div className="scan-list__cand-row">
                <span className={`scan-list__dir scan-list__dir--${c.direction}`}>
                    {c.direction === 'short' ? '▾' : '▴'}
                </span>
                <button className="scan-list__ticker" onClick={() => onSelect?.(c)} title="Build a trade idea from this">
                    {c.ticker}
                    <span className="scan-list__ticker-hint">Build idea →</span>
                </button>
                <span className="scan-list__cand-thesis">{c.thesis}</span>
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

function ScanCard({ scan, onCandidateSelect, onDelete, onEditScan }) {
    const dir = scan.direction
    return (
        <div className="scan-list__card">
            <div className="scan-list__card-header">
                <span className="scan-list__thesis">{scan.thesis}</span>
                <span className={`scan-list__card-dir scan-list__card-dir--${dir}`}>{dir}</span>
                <span className="scan-list__count">{scan.candidates.length}</span>
                <button className="scan-list__edit" onClick={() => onEditScan?.(scan)} aria-label="Edit list" title="Edit this list in the scanner chat">
                    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M11.5 1.5L14.5 4.5L5.5 13.5H2.5V10.5L11.5 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                        <path d="M9.5 3.5L12.5 6.5" stroke="currentColor" strokeWidth="1.4"/>
                    </svg>
                </button>
                <button className="scan-list__delete" onClick={() => onDelete?.(scan.id)} aria-label="Delete list" title="Delete list">
                    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M2.5 4H13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                        <path d="M6.5 4V2.8C6.5 2.36 6.86 2 7.3 2H8.7C9.14 2 9.5 2.36 9.5 2.8V4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                        <path d="M3.7 4L4.3 13C4.34 13.56 4.8 14 5.36 14H10.64C11.2 14 11.66 13.56 11.7 13L12.3 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M6.5 6.5V11.5M9.5 6.5V11.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                </button>
            </div>
            <div className="scan-list__cands">
                {scan.candidates.map(c => (
                    <Candidate key={c.ticker} c={c} onSelect={(cand) => onCandidateSelect?.(cand, scan)} />
                ))}
            </div>
        </div>
    )
}

export function ScanList({ scans = [], loading, onCandidateSelect, onDelete, onEditScan }) {
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
                return (
                    <div key={periodKey(group.period)} className="scan-list__group">
                        <div className="scan-list__group-label">
                            <span className="scan-list__group-period">{title}</span>
                            {sub && <span className="scan-list__group-range">{sub}</span>}
                        </div>
                        {group.items.map(scan => (
                            <ScanCard key={scan.id} scan={scan} onCandidateSelect={onCandidateSelect} onDelete={onDelete} onEditScan={onEditScan} />
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
