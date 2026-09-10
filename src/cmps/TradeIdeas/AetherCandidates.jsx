import { useState } from 'react'
import PropTypes from 'prop-types'
import { useAuth } from '../../context/AuthContext.jsx'
import { aetherService } from '../../services/aether/aether.service.remote.js'
import { apiError } from '../../services/http.service.js'
import './AetherCandidates.scss'

// Aether's event list. A run is one named event; a candidate is one company it named.
//
// Collapsed row: ticker · direction · magnitude · urgency · horizon.
// Expanded: the mechanism, the press fact with its source, and the filing sentence.
//
// EVERY FIELD IS MEASURED OR ABSENT. The engine reports an unknown size as unknown
// rather than a plausible guess, so a dash here means "not measured", never "small".
// That distinction is the whole reason the previous shock feed was retired: it showed
// "large"/"medium" on 170 cards, never "small", off a channel state three months stale.

const SIDE = {
    hurt:   { label: 'SHORT', cls: 'is-short' },
    helped: { label: 'LONG',  cls: 'is-long' },
    mixed:  { label: 'MIXED', cls: 'is-mixed' },
}

// Urgency is about how soon the read goes cold, not how big it is.
const URGENCY = {
    moved:   { label: 'moved',   cls: 'is-moved',   hint: 'the excess move has already happened' },
    fresh:   { label: 'fresh',   cls: 'is-fresh',   hint: 'surfaced in the last few days and still quiet' },
    working: { label: 'working', cls: 'is-working', hint: 'in flight' },
    stale:   { label: 'stale',   cls: 'is-stale',   hint: 'old enough that the thesis needs re-checking' },
    no_price: { label: '—',      cls: 'is-none',    hint: 'no price measured yet' },
}

// ── urgency, derived here ─────────────────────────────────────────────────────
//
// The engine does NOT store this. `status` is a display function in the Python CLI, so the
// column read `c.status`, found undefined on every row, and fell through to "—" for all 43
// names — while excess_pct and extension sat on the very same documents, measured and
// correct. An empty column that looks like missing data, on top of data that is not missing.
//
// THE THRESHOLDS ARE DUPLICATED, and that is the cost of computing it here rather than
// storing it. They mirror candidates.py — _BIG_EXTENSION, _FLAT_MOVE_FALLBACK, _STALE_DAYS
// — and if that file changes, this drifts silently. Pinned in a test for exactly that
// reason; the alternative was another engine field to write, migrate and keep in sync.
const BIG_EXTENSION     = 2.0    // σ of the name's own trailing move
const FLAT_MOVE_FALLBACK = 0.05  // used only when there was too little history for a σ
const STALE_DAYS        = 21
const FRESH_DAYS        = 3

/**
 * How soon this read goes cold.
 *
 * Judged on EXTENSION where a sigma exists, falling back to a flat percentage only when
 * there was not enough history to measure one — 4% is an ordinary day for a volatile name
 * and a serious event for a utility. Deliberately coarse either way.
 *
 * `excess_pct`, never `move_pct`: a name up 6% in a week the market rose 6% has done
 * nothing, and calling that "moved" would retire the candidate for no reason.
 */
// eslint-disable-next-line react-refresh/only-export-components -- exported so the duplicated thresholds can be tested against the engine's
export function urgencyOf(c, now = Date.now()) {
    if (c?.excess_pct == null) return URGENCY.no_price

    const ext = c.extension
    const big = ext != null
        ? Math.abs(ext) >= BIG_EXTENSION
        : Math.abs(c.excess_pct) >= FLAT_MOVE_FALLBACK
    if (big) return URGENCY.moved

    // A broken or missing timestamp reads as brand new rather than as an error — the age
    // only chooses between fresh and stale, and neither is worth throwing over.
    const ms = new Date(c.created_at ?? '').getTime()
    const age = Number.isNaN(ms) ? 0 : Math.floor((now - ms) / 86_400_000)

    if (age >= STALE_DAYS) return URGENCY.stale
    return age <= FRESH_DAYS ? URGENCY.fresh : URGENCY.working
}

// What KIND of event this is, by who acted. A label, never a filter — the engine runs on
// the three runnable tests, and this only tells a reader what they are looking at.
const CATEGORY_HINT = {
    trade:        'a state restricting or taxing cross-border commerce',
    fiscal:       'a legislature or treasury moving money — a subsidy, credit or appropriation',
    regulatory:   'an agency deciding — a rule, approval, recall or ruling',
    geopolitical: 'states acting on each other or on their own resources',
    macro:        'a central bank, currency regime or sovereign event',
    disruption:   'a physical event with no author — a strike, fire, outage or storm',
}

const VERDICT_HINT = {
    quantified: 'the filing states a figure — exposure disclosed and sized',
    mentioned:  'the filing names it without sizing it',
    silent:     'the company files, and never mentions it',
    no_filer:   'no SEC filer for this ticker',
}

const SWING_DAYS = 30

// How many names a run shows before the reader asks for the rest.
//
// Ten because that is where the largest gap in the top of the live run sits — 0.31 between
// the tenth and eleventh — and because the alternative is worse, not because ten is right.
// The ranks descend smoothly with no cliff, so any cut is a judgement; a count admits that,
// where a rank floor would imply the evidence drew a line it did not draw.
const SHORTLIST = 10

function pct(v, digits = 1) {
    return v == null ? '—' : `${(v * 100).toFixed(digits)}%`
}

function daysUntil(iso) {
    if (!iso) return null
    const ms = new Date(`${iso}T00:00:00Z`).getTime() - Date.now()
    return Number.isNaN(ms) ? null : Math.round(ms / 86_400_000)
}

/** Horizon from the candidate's own expiry — the next print, where one is known. */
function horizon(c) {
    const d = daysUntil(c.expires_at)
    if (d == null) return { label: '—', hint: 'no expiry set' }
    if (d <= SWING_DAYS) {
        return { label: 'swing', hint: `${d}d to expiry — its next report is close` }
    }
    return { label: 'position', hint: `${d}d to expiry` }
}

/**
 * Magnitude the engine actually measured: the figure the company disclosed, over its
 * own revenue. Absent for most names, and shown as absent — filings state a size for
 * roughly a third of the ones they mention at all.
 */
function magnitude(c) {
    if (c.impact_pct_revenue != null) {
        return { label: pct(c.impact_pct_revenue, 2), hint: 'disclosed impact ÷ trailing revenue' }
    }
    return { label: '—', hint: 'no figure stated in the filing — size not measured' }
}

/**
 * The run button. ADMIN ONLY, and hiding it is the courtesy — the server is the guard.
 *
 * Discovery is the one leg of the engine that is not on a schedule, because it is the one
 * that spends per press: an Opus call with web search for each event it selects, plus
 * several hundred SEC requests. Whether today held an event worth that is a judgement, so
 * a person makes it.
 *
 * It reports STARTED, never finished. A run is minutes long and writes to Mongo when it
 * lands; the list polls every five minutes and will pick the names up on its own.
 */
function RunButton() {
    const { isAdmin } = useAuth() ?? {}
    const [state, setState] = useState('idle')     // idle | starting | started | busy | failed
    const [why, setWhy] = useState('')

    if (!isAdmin) return null

    async function run() {
        setState('starting')
        try {
            await aetherService.startDiscovery()
            setState('started')
        } catch (err) {
            // 409 is "one is already going" — an answer, not a failure. Calling it failed
            // would invite exactly the second press the server just refused.
            if (err?.response?.status === 409) return setState('busy')
            // Everything else is worth reading: no engine on this host, no resolvable
            // database. apiError is the one reader that finds the server's own message —
            // err.message alone is axios's "Request failed with status code 503".
            setWhy(apiError(err, 'could not start'))
            setState('failed')
        }
    }

    const LABEL = {
        idle:     'Run discovery',
        starting: 'Starting…',
        started:  'Running — names land in a few minutes',
        busy:     'Already running',
        failed:   'Could not start — press to retry',
    }

    return (
        <button
            type="button"
            className="aether-candidates__run-btn"
            onClick={run}
            disabled={state === 'starting' || state === 'started' || state === 'busy'}
            title={state === 'failed'
                ? why
                : 'Reads the news queue, picks the events worth a run, and names the companies each reaches. Costs a model call per event plus an EDGAR pass per candidate, which is why it is not on a schedule.'}
        >
            {LABEL[state]}
        </button>
    )
}

/**
 * Flip the list from event-first to TICKER-first.
 *
 * The server groups by run, which is the right shape for "what did this event reach" and
 * the wrong one for a watchlist: a company named by two events appeared twice, in two
 * tables, with nothing on either row to say the other existed. That is precisely the case
 * worth surfacing — a name reached independently by a tariff AND an export ban is saying
 * something neither event says alone, and it was the one thing the old layout could not
 * show.
 *
 * Each appearance keeps its own event, because the mechanism, the filing sentence and the
 * move are all per-event; only the ticker is shared.
 *
 * Ordered by the BEST rank a name achieved, not by the sum. A sum would let three weak
 * appearances outrank one well-evidenced name, which is the opposite of the point — and
 * once there are enough runs to see what actually recurs, the count is the thing to
 * revisit, deliberately, rather than something to have baked in early.
 */
// eslint-disable-next-line react-refresh/only-export-components -- pure, and the ordering is worth testing directly
export function byTicker(runs = []) {
    const map = new Map()

    for (const run of runs) {
        for (const c of run.candidates ?? []) {
            if (!map.has(c.ticker)) map.set(c.ticker, { ticker: c.ticker, appearances: [] })
            map.get(c.ticker).appearances.push({
                ...c,
                run_id:         run.run_id,
                subject:        run.subject,
                event:          run.event,
                event_category: run.event_category,
                event_date:     run.event_date,
                answer_shape:   run.answer_shape,
            })
        }
    }

    const rows = [...map.values()]
    for (const row of rows) {
        row.appearances.sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))
        row.best = row.appearances[0]
        row.rank = row.best?.rank ?? 0
        // A name one event helps and another hurts is not a contradiction to hide behind a
        // single arrow — it is two live claims about the same company, and the reader has
        // to see that before acting on either.
        row.conflicted = new Set(row.appearances.map(a => a.side)).size > 1
    }
    rows.sort((a, b) => b.rank - a.rank || a.ticker.localeCompare(b.ticker))
    return rows
}

export function AetherCandidates({ runs = [], loading, onSymbolClick }) {
    const [open, setOpen] = useState(() => new Set())
    const [showAll, setShowAll] = useState(false)

    // THE SHORTLIST, and the rest one click away. Top N rather than a rank floor because
    // the ranks do not break: they descend 6.57, 6.27, 5.99, 5.91, 5.88 — gaps of 0.03 to
    // 0.31, no cliff to cut at. A floor would present a threshold the evidence did not
    // draw; a count is arbitrary and reads as arbitrary.
    const rows = byTicker(runs)
    const shown = showAll ? rows : rows.slice(0, SHORTLIST)

    function toggle(key) {
        setOpen(prev => {
            const next = new Set(prev)
            next.has(key) ? next.delete(key) : next.add(key)
            return next
        })
    }

    if (loading) return <p className="aether-candidates__empty">Loading…</p>
    // The empty state is where the button matters most: nothing has run, and an admin is
    // the only one who can change that.
    if (!runs.length) {
        return (
            <div className="aether-candidates">
                <p className="aether-candidates__empty">
                    No events in the window. Aether names companies when a story breaks — nothing has
                    run recently.
                </p>
                <div className="aether-candidates__bar"><RunButton /></div>
            </div>
        )
    }

    return (
        <div className="aether-candidates">
            <div className="aether-candidates__bar"><RunButton /></div>
            {/* The events behind the list. Ticker-first buries the question the names
                answer, so it is restated once here rather than repeated on every row. */}
            <div className="aether-candidates__events">
                {runs.map(run => (
                    <span key={run.run_id} className="aether-candidates__event-chip" title={run.event}>
                        <span className="aether-candidates__subject">{run.subject || run.run_id}</span>
                        {run.event_category && (
                            <span className="aether-candidates__category"
                                  title={CATEGORY_HINT[run.event_category] ?? ''}>
                                {run.event_category}
                            </span>
                        )}
                        {run.event_date && (
                            <span className="aether-candidates__date" title="when the event took effect">
                                {run.event_date}
                            </span>
                        )}
                    </span>
                ))}
            </div>

            <table className="aether-candidates__table">
                        <thead>
                            <tr>
                                <th />
                                <th>Ticker</th>
                                <th>Dir</th>
                                <th className="is-num">Magnitude</th>
                                <th>Urgency</th>
                                <th>Horizon</th>
                            </tr>
                        </thead>
                        <tbody>
                            {shown.map(row => {
                                const isOpen = open.has(row.ticker)
                                const b = row.best
                                const side = row.conflicted ? SIDE.mixed : (SIDE[b.side] ?? SIDE.mixed)
                                const urg = urgencyOf(b)
                                const hz = horizon(b)
                                const mag = magnitude(b)
                                const n = row.appearances.length

                                return [
                                    <tr
                                        key={row.ticker}
                                        className={`aether-candidates__row ${isOpen ? 'is-open' : ''}`}
                                        onClick={() => toggle(row.ticker)}
                                    >
                                        <td className="aether-candidates__caret">{isOpen ? '▾' : '▸'}</td>
                                        <td>
                                            <button
                                                type="button"
                                                className="aether-candidates__ticker"
                                                onClick={ev => { ev.stopPropagation(); onSymbolClick?.(row.ticker) }}
                                            >
                                                {row.ticker}
                                            </button>
                                            <span className="aether-candidates__tier" title="1 = named in coverage, 2 = a step removed, 3 = further">
                                                t{b.tier}
                                            </span>
                                            {/* The recurrence — two events reaching one company is
                                                the case the event-first list could not show. */}
                                            {n > 1 && (
                                                <span className="aether-candidates__events-count"
                                                      title={`named by ${n} events: ${row.appearances.map(a => a.subject).join(', ')}`}>
                                                    {n} events
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            <span className={`aether-candidates__side ${side.cls}`}
                                                  title={row.conflicted
                                                      ? 'these events pull it in opposite directions — open the row'
                                                      : undefined}>
                                                {side.label}
                                            </span>
                                        </td>
                                        <td className="is-num" title={mag.hint}>{mag.label}</td>
                                        <td><span className={`aether-candidates__urgency ${urg.cls}`} title={urg.hint}>{urg.label}</span></td>
                                        <td title={hz.hint}>{hz.label}</td>
                                    </tr>,

                                    isOpen && (
                                        <tr key={`${row.ticker}:detail`} className="aether-candidates__detail-row">
                                            <td colSpan={6}>
                                                <div className="aether-candidates__detail">
                                                    {row.appearances.map(c => (
                                                    <section key={c.run_id} className="aether-candidates__appearance">
                                                    <h4 className="aether-candidates__appearance-head">
                                                        <span className={`aether-candidates__side ${(SIDE[c.side] ?? SIDE.mixed).cls}`}>
                                                            {(SIDE[c.side] ?? SIDE.mixed).label}
                                                        </span>
                                                        {' '}{c.subject}
                                                        {c.event_date && <span className="aether-candidates__date"> · {c.event_date}</span>}
                                                    </h4>
                                                    <p className="aether-candidates__headline">{c.event}</p>
                                                    <dl>
                                                        <dt>Why</dt>
                                                        <dd>{c.mechanism || '—'}</dd>

                                                        <dt>Reported</dt>
                                                        <dd>
                                                            {c.press_evidence || '—'}
                                                            {c.source_url && (
                                                                <>
                                                                    {' '}
                                                                    <a href={c.source_url} target="_blank" rel="noreferrer">source</a>
                                                                </>
                                                            )}
                                                        </dd>

                                                        <dt title={VERDICT_HINT[c.verdict]}>Its own filing</dt>
                                                        <dd>
                                                            <span className={`aether-candidates__verdict is-${c.verdict}`}>
                                                                {c.verdict}
                                                            </span>
                                                            {c.filing_evidence
                                                                ? <blockquote>{c.filing_evidence}</blockquote>
                                                                : <em> nothing in its filings mentions this — which is information, not an error</em>}
                                                        </dd>

                                                        <dt>Move since the event</dt>
                                                        <dd>
                                                            {c.move_pct == null ? '—' : (
                                                                <>
                                                                    {pct(c.move_pct)} raw,{' '}
                                                                    <strong>{pct(c.excess_pct)} vs SPY</strong>
                                                                    {c.extension != null && <> · {c.extension.toFixed(1)}σ</>}
                                                                    {c.reaction && <> · {c.reaction}</>}
                                                                    {c.price_asof && <span className="aether-candidates__asof"> as of {c.price_asof}</span>}
                                                                </>
                                                            )}
                                                        </dd>

                                                        <dt>Next report</dt>
                                                        <dd>
                                                            {c.next_earnings
                                                                ? <>{c.next_earnings}{c.days_to_earnings != null && <> · {c.days_to_earnings}d</>}</>
                                                                : '—'}
                                                            {c.expires_at && <> · expires {c.expires_at}</>}
                                                        </dd>

                                                        {c.rank_parts && (
                                                            <>
                                                                <dt title="the rank is a sum you can take apart, not a score">Rank</dt>
                                                                <dd className="aether-candidates__rank">
                                                                    {c.rank?.toFixed(1)}
                                                                    {' = '}
                                                                    {Object.entries(c.rank_parts)
                                                                        .filter(([, v]) => v)
                                                                        .map(([k, v]) => `${k} ${v}`)
                                                                        .join(' + ') || '—'}
                                                                </dd>
                                                            </>
                                                        )}
                                                    </dl>
                                                    </section>
                                                    ))}
                                                </div>
                                            </td>
                                        </tr>
                                    ),
                                ]
                            })}
                        </tbody>
            </table>

            {/* Never a silent truncation: a reader who cannot tell the list was cut cannot
                tell whether the cut was wrong. */}
            {rows.length > SHORTLIST && (
                <button
                    type="button"
                    className="aether-candidates__more"
                    onClick={() => setShowAll(v => !v)}
                    title="Every name is stored, ranked and reachable — this only decides how many open on screen."
                >
                    {showAll
                        ? `Show the top ${SHORTLIST}`
                        : `${rows.length - SHORTLIST} more, lower ranked`}
                </button>
            )}
        </div>
    )
}

AetherCandidates.propTypes = {
    runs: PropTypes.array,
    loading: PropTypes.bool,
    onSymbolClick: PropTypes.func,
}
