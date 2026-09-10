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

export function AetherCandidates({ runs = [], loading, onSymbolClick }) {
    const [open, setOpen] = useState(() => new Set())
    const [expanded, setExpanded] = useState(() => new Set())   // runs showing their full list

    /**
     * The shortlist, and the rest one click away.
     *
     * A run returns everything it named — 43 survivors on the Canada tariffs — and a
     * 43-row list is not a shortlist, it is the same "here is everything" the reader came
     * here to be spared. The rows are already sorted by rank server-side.
     *
     * TOP N AND NOT A RANK FLOOR, because the ranks do not break. They descend 6.57, 6.27,
     * 5.99, 5.91, 5.88 — gaps of 0.03 to 0.31, no cliff anywhere to cut at. A floor would
     * read as a threshold the evidence supports, and there isn't one. A count is honestly
     * arbitrary and says so.
     *
     * Nothing is hidden that is not reachable, and the count is on the button: the whole
     * design rule here is that a filter whose rejections leave no trace cannot be shown to
     * be wrong.
     */
    function shownFor(run) {
        const all = run.candidates ?? []
        return expanded.has(run.run_id) ? all : all.slice(0, SHORTLIST)
    }

    function toggleExpanded(runId) {
        setExpanded(prev => {
            const next = new Set(prev)
            next.has(runId) ? next.delete(runId) : next.add(runId)
            return next
        })
    }

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
            {runs.map(run => (
                <section key={run.run_id} className="aether-candidates__run">
                    <header className="aether-candidates__event">
                        <div className="aether-candidates__event-line">
                            <span className="aether-candidates__subject">{run.subject || run.run_id}</span>
                            {run.event_category && (
                                <span
                                    className="aether-candidates__category"
                                    title={CATEGORY_HINT[run.event_category] ?? ''}
                                >
                                    {run.event_category}
                                </span>
                            )}
                            {run.answer_shape && (
                                <span
                                    className={`aether-candidates__shape is-${run.answer_shape}`}
                                    title={run.answer_shape === 'sized'
                                        ? 'this event lands on a line item, so filings tend to state figures'
                                        : 'a dependency story — filings mention it without sizing it'}
                                >
                                    {run.answer_shape === 'sized' ? 'sized' : 'names only'}
                                </span>
                            )}
                            {run.event_date && (
                                <span className="aether-candidates__date" title="when the event took effect">
                                    {run.event_date}
                                </span>
                            )}
                        </div>
                        <p className="aether-candidates__headline">{run.event}</p>
                    </header>

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
                            {shownFor(run).map(c => {
                                const key = `${run.run_id}:${c.ticker}`
                                const isOpen = open.has(key)
                                const side = SIDE[c.side] ?? SIDE.mixed
                                const urg = urgencyOf(c)
                                const hz = horizon(c)
                                const mag = magnitude(c)

                                return [
                                    <tr
                                        key={key}
                                        className={`aether-candidates__row ${isOpen ? 'is-open' : ''}`}
                                        onClick={() => toggle(key)}
                                    >
                                        <td className="aether-candidates__caret">{isOpen ? '▾' : '▸'}</td>
                                        <td>
                                            <button
                                                type="button"
                                                className="aether-candidates__ticker"
                                                onClick={ev => { ev.stopPropagation(); onSymbolClick?.(c.ticker) }}
                                            >
                                                {c.ticker}
                                            </button>
                                            <span className="aether-candidates__tier" title="1 = named in coverage, 2 = a step removed, 3 = further">
                                                t{c.tier}
                                            </span>
                                        </td>
                                        <td><span className={`aether-candidates__side ${side.cls}`}>{side.label}</span></td>
                                        <td className="is-num" title={mag.hint}>{mag.label}</td>
                                        <td><span className={`aether-candidates__urgency ${urg.cls}`} title={urg.hint}>{urg.label}</span></td>
                                        <td title={hz.hint}>{hz.label}</td>
                                    </tr>,

                                    isOpen && (
                                        <tr key={`${key}:detail`} className="aether-candidates__detail-row">
                                            <td colSpan={6}>
                                                <div className="aether-candidates__detail">
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
                                                </div>
                                            </td>
                                        </tr>
                                    ),
                                ]
                            })}
                        </tbody>
                    </table>

                    {/* The rest, and how many. Never a silent truncation: a reader who
                        cannot tell the list was cut cannot tell whether the cut was wrong. */}
                    {(run.candidates?.length ?? 0) > SHORTLIST && (
                        <button
                            type="button"
                            className="aether-candidates__more"
                            onClick={() => toggleExpanded(run.run_id)}
                            title="Every name the run produced is stored, ranked and reachable — this only decides how many open on screen."
                        >
                            {expanded.has(run.run_id)
                                ? `Show the top ${SHORTLIST}`
                                : `${run.candidates.length - SHORTLIST} more, lower ranked`}
                        </button>
                    )}
                </section>
            ))}
        </div>
    )
}

AetherCandidates.propTypes = {
    runs: PropTypes.array,
    loading: PropTypes.bool,
    onSymbolClick: PropTypes.func,
}
