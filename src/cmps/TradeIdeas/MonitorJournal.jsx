import { useState, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import { tidyPrices, readEntry } from './monitorJournal.utils.js'
import './MonitorJournal.scss'

// ── The monitor journal ────────────────────────────────────────────────────────
// The running, first-person monologue of every monitor wake, rendered the same way wherever a
// monitor writes one. The timeline is appended oldest→newest by the backend (the entries are built
// by monitoring/monitorJournal.js); render chronologically and keep the box pinned to the latest,
// chat-style.
//
// This lived inside CallPage while SetupPage had `JSON.stringify(entry)` — so the setup pop-out
// could not render a journal at all. The split mirrors the backend's: the SHELL is shared (the box,
// the meta row, the collapsible axes, the price tidying) and the COPY belongs to the caller — a
// monitor names itself in its own empty state and labels the wake kinds only it produces.
//
// It lives beside the other shared pop-out pieces (PopoutFooter, chartOverlay) because it is the
// same kind of thing: entity chrome that both the call and the setup window draw.
//
// Legacy tolerance: Talos briefly wrote `{kind, next_at, read}` where Hermes writes `{reason,
// next_check_at, note}`, and those entries are still in live docs. Both are read, so a setup armed
// before the shared builder still renders instead of showing a blank bubble; they age out of the
// journal cap on their own.

// The wake kinds every monitor has. A caller merges its own on top (Hermes's in-position era).
//
// `closed` and `market_closed` are the SAME wake. The value was renamed server-side because
// `closed` read as "the position closed" while it means "the market is shut" — and `exit` is now
// the position one, so the two would have sat side by side meaning opposites. Entries written
// before the rename are still in live docs; both keys are here so they render identically until
// they age out of the journal cap.
const BASE_REASON_LABEL = {
    pre_active:     'not live yet',
    market_closed:  'market closed',
    closed:         'market closed',   // legacy — delete once no live journal predates the rename
    scheduled:      'heartbeat',
    momentum_pulse: 'pulse',
    zone_trip:      'in zone',
    expiry_review:  'expiry review',
    exit:           'closed out',
}

// A wake that PAID for a model read — it earns the fetched line and the axes block.
const ASSESSMENT_REASONS = new Set(['zone_trip', 'expiry_review', 'in_position', 'momentum_pulse'])

// One assessment axis: the label + conclusion tag are the always-visible summary row (a toggle),
// and the analysis read collapses below it — default collapsed to keep the journal compact.
function JournalAxis({ label, read, tag }) {
    const [open, setOpen] = useState(false)
    const hasRead = !!read
    return (
        <div className="monitor-journal__axis">
            <button
                type="button"
                className="monitor-journal__axis-head"
                onClick={() => hasRead && setOpen(o => !o)}
                aria-expanded={hasRead ? open : undefined}
                disabled={!hasRead}
            >
                <span className="monitor-journal__axis-k">{label}</span>
                {tag && <span className={`monitor-journal__axis-tag tag--${tag}`}>{tag}</span>}
                {hasRead && <span className="monitor-journal__axis-caret">{open ? '▾' : '▸'}</span>}
            </button>
            {hasRead && open && <p className="monitor-journal__axis-read">{tidyPrices(read)}</p>}
        </div>
    )
}
JournalAxis.propTypes = { label: PropTypes.string, read: PropTypes.string, tag: PropTypes.string }

function JournalAxes({ axes }) {
    const rows = [
        axes?.market       && ['market', axes.market.read,       axes.market.score],
        axes?.news         && ['news',   axes.news.read,         axes.news.score],
        axes?.price_action && ['price',  axes.price_action.read, axes.price_action.strength],
    ].filter(Boolean)
    const pats = Array.isArray(axes?.patterns_seen) ? axes.patterns_seen.filter(p => p?.present) : []
    if (!rows.length && !pats.length) return null
    return (
        <div className="monitor-journal__axes">
            {rows.map(([k, read, tag]) => <JournalAxis key={k} label={k} read={read} tag={tag} />)}
            {pats.length > 0 && (
                <div className="monitor-journal__axis">
                    <div className="monitor-journal__axis-head monitor-journal__axis-head--static">
                        <span className="monitor-journal__axis-k">patterns</span>
                    </div>
                    <p className="monitor-journal__axis-read">{tidyPrices(pats.map(p => p.note || p.id).join(' · '))}</p>
                </div>
            )}
        </div>
    )
}
JournalAxes.propTypes = { axes: PropTypes.object }

function JournalEntry({ entry, reasonLabels = BASE_REASON_LABEL }) {
    const e        = readEntry(entry)
    const time     = e.at ? new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
    const isAssess = ASSESSMENT_REASONS.has(e.reason)
    return (
        <div className={`monitor-journal__entry monitor-journal__entry--${e.reason}`}>
            <div className="monitor-journal__meta">
                <span className="monitor-journal__time">{time}</span>
                <span className="monitor-journal__reason">{reasonLabels[e.reason] ?? e.reason}</span>
                {e.price != null && <span className="monitor-journal__price">@ {tidyPrices(String(e.price))}</span>}
                {e.verdict && <span className={`monitor-journal__verdict verdict--${e.verdict}`}>{e.verdict}</span>}
            </div>
            {/* A pre-shared-builder entry carries no prose at all. Show the meta row and stop —
                the old setup pop-out printed the stringified object here instead. */}
            {e.note && <p className="monitor-journal__note">{tidyPrices(e.note)}</p>}
            {isAssess && e.fetched && <div className="monitor-journal__fetched">fetched {e.fetched}</div>}
            {isAssess && <JournalAxes axes={e.axes} />}
        </div>
    )
}
JournalEntry.propTypes = { entry: PropTypes.object.isRequired, reasonLabels: PropTypes.object }

/**
 * @param {array}  timeline      monitor_state.timeline, oldest→newest
 * @param {string} empty         what to say before the first wake — the monitor names itself here
 * @param {object} reasonLabels  extra/override wake labels, merged over the shared ones
 */
export function MonitorJournal({ timeline, empty, reasonLabels }) {
    const boxRef = useRef(null)
    const list   = Array.isArray(timeline) ? timeline : []
    // Keep pinned to the newest entry as the journal grows (only scrolls the box, not the column).
    useEffect(() => { const el = boxRef.current; if (el) el.scrollTop = el.scrollHeight }, [list.length])

    if (!list.length) return <p className="monitor-journal__empty">{empty}</p>

    const labels = reasonLabels ? { ...BASE_REASON_LABEL, ...reasonLabels } : BASE_REASON_LABEL
    return (
        <div className="monitor-journal" ref={boxRef}>
            {list.map((e, i) => <JournalEntry key={i} entry={e} reasonLabels={labels} />)}
        </div>
    )
}
MonitorJournal.propTypes = {
    timeline:     PropTypes.array,
    empty:        PropTypes.string.isRequired,
    reasonLabels: PropTypes.object,
}
