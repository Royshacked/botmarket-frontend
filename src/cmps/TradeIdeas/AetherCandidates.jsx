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
                            {run.candidates.map(c => {
                                const key = `${run.run_id}:${c.ticker}`
                                const isOpen = open.has(key)
                                const side = SIDE[c.side] ?? SIDE.mixed
                                const urg = URGENCY[c.status] ?? URGENCY.no_price
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
