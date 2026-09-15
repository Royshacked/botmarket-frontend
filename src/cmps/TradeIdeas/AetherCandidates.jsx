import { useState, useEffect, useMemo, useRef } from 'react'
import PropTypes from 'prop-types'
import { useAuth } from '../../context/AuthContext.jsx'
import { aetherService } from '../../services/aether/aether.service.remote.js'
import { apiError } from '../../services/http.service.js'
import { RowHost } from '../Floor/RowHost.jsx'
import { SymbolCell } from '../EntityCard/EntityCard.jsx'
import { fmtShortDay } from '../Floor/floor.utils.js'
import { openSetupPopup } from './tradeIdea.utils.js'
import { isTerminal, isLivePosition, isAwaitingConfirm, isArmed, isUnarmed } from '../../services/entityStatus.js'
import './AetherCandidates.scss'

// Aether's event list — ONE ROW PER EVENT, the names it reached inside, and a name's own
// evidence one level further down.
//
// Event row (collapsed): subject · how many names · when it took effect · kind · how many
// of the names its filings sized. Open: the event sentence, then a sub-row per name —
// direction · ticker · recurrence · horizon · magnitude · urgency — and a name opens to its
// mechanism, the press fact, the filing sentence and the move.
//
// EVENT-FIRST, AND RECURRENCE STILL VISIBLE. The list was flipped ticker-first once, for
// one reason: event-first showed a company named by two events twice, in two tables, with
// nothing on either row to say the other existed — and a name reached independently by a
// tariff AND an export ban is saying something neither event says alone. That is still the
// case worth surfacing, so it is surfaced three ways rather than by giving up the event as
// the unit: a strip above the list naming every recurring ticker, a ×N badge on the name's
// row inside each event, and the other events listed in the name's own drawer as jumps.
//
// It wears the Floor's own row vocabulary rather than a table of its own: floor-sub for the
// event accordion, RowHost for the hover shell, floor-row for the line, floor-row--sub for
// the names inside, floor-detail for the drawer. Five lists share this column and a sixth
// that expanded differently, coloured differently and sized differently would read as a
// different kind of thing on the same screen.
//
// EVERY FIELD IS MEASURED OR ABSENT. The engine reports an unknown size as unknown
// rather than a plausible guess, so a dash here means "not measured", never "small".
// That distinction is the whole reason the previous shock feed was retired: it showed
// "large"/"medium" on 170 cards, never "small", off a channel state three months stale.

// `dir` is the Floor's own direction vocabulary — the same glyph and colour the trade,
// holding and scan rows use, so a short reads identically wherever it appears.
const SIDE = {
    hurt:   { label: 'SHORT', dir: 'short' },
    helped: { label: 'LONG',  dir: 'long' },
    mixed:  { label: 'MIXED', dir: 'mixed' },
}

// Urgency is about how soon the read goes cold, not how big it is.
const URGENCY = {
    moved:    { key: 'moved',    label: 'moved',   hint: 'the excess move has already happened' },
    fresh:    { key: 'fresh',    label: 'fresh',   hint: 'surfaced in the last few days and still quiet' },
    working:  { key: 'working',  label: 'working', hint: 'in flight' },
    stale:    { key: 'stale',    label: 'stale',   hint: 'old enough that the thesis needs re-checking' },
    no_price: { key: 'no_price', label: '—',       hint: 'no price measured yet' },
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
    corporate:    'a company acting on its own account — an order cut, a capacity deal, a supplier switch — that reaches other companies',
}

const VERDICT_HINT = {
    quantified: 'the filing states a figure — exposure disclosed and sized',
    mentioned:  'the filing names it without sizing it',
    silent:     'the company files, and never mentions it',
    no_filer:   'no SEC filer for this ticker',
    // The absence of a reading, not a fifth reading. `silent` is a claim about the filing
    // and is scored; this means EDGAR could not be asked — an outage, a fetch that failed —
    // and the name is dropped rather than ranked on a question nobody answered.
    unverified: 'EDGAR could not be asked — the filing was never read, which is not the same as silent',
}

const SWING_DAYS = 30

// How many names a run shows before the reader asks for the rest.
//
// Ten because that is where the largest gap in the top of the live run sits — 0.31 between
// the tenth and eleventh — and because the alternative is worse, not because ten is right.
// The ranks descend smoothly with no cliff, so any cut is a judgement; a count admits that,
// where a rank floor would imply the evidence drew a line it did not draw.
const SHORTLIST = 10

// How many recurring names the strip shows before the reader asks for the rest. Twelve
// is two rows of chips at the column's width; the live list had 27 the day this was
// built — the Middle East cluster is four events on one story — and four rows of chips
// pushed the events themselves below the fold, which inverts what the strip is for.
const STRIP_MAX = 12

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
// WHAT BACKS THIS NAME, where there is no percentage to show.
//
// The cell used to print a bare em-dash for anything unsized, which on some events is very
// nearly the whole list: on the Iran run three of the seven rank parts never fired, so 39 of
// 45 survivors scored on bucket membership alone and 26 of them tied on two values. A tie
// printed as an ordered list invites the reader to believe the ninth name beats the tenth.
//
// The verdict already says which kind of row this is, so a reader can see a press-only name
// as a press-only name instead of reading a dash and supplying their own guess. A separate
// evidence grade was built for this cell and dropped: measured over the live rows it agreed
// with the verdict 114 times out of 114.
const BACKING = {
    quantified: { label: 'figure',     hint: 'EDGAR found a figure in its filings, though not one that converts to a share of revenue' },
    mentioned:  { label: 'named',      hint: 'its filings name the subject and put no number on it' },
    silent:     { label: 'press only', hint: 'EDGAR found nothing — this name rests on the press mechanism alone, which is information rather than an error' },
}

function magnitude(c) {
    if (c.impact_pct_revenue != null) {
        return { label: pct(c.impact_pct_revenue, 2), hint: 'disclosed impact ÷ trailing revenue' }
    }
    return BACKING[c.verdict]
        // no_filer, skipped, unverified — none of which is a reading of a filing, so none of
        // them gets a word that implies one.
        ?? { label: '—', hint: 'no figure stated in the filing — size not measured' }
}

// ── the hand-off to Mentor ────────────────────────────────────────────────────
//
// These names are for SWING trades, and Mentor builds the setup. Aether supplies the why —
// the event, the mechanism, what the press and the filings said, how far it has moved, when
// the clock runs out — and Mentor does what it does: entry, invalidation, size, a window,
// monitored. The split is the one the whole app runs on: the desk that found the name owns
// the evidence, the desk that trades owns the trade.

/**
 * Whether this name is still a trade, and if not, why.
 *
 * Offered only while the clock runs and the name has not moved. A `moved` name is the case
 * the desk exists to get in FRONT of — offering it as a fresh swing after the move would be
 * offering the reader the part that already happened. A `stale` one is old enough that the
 * mechanism needs re-checking before anyone sizes it, and a name past its expiry has had its
 * print: the market was forced to look, and whatever it thought is in the price.
 *
 * `no_price` is allowed. It means the move has not been measured yet — usually a name found
 * today — not that anything is wrong with it.
 */
// eslint-disable-next-line react-refresh/only-export-components -- pure, and the gate is worth testing
export function tradable(c, now = Date.now()) {
    if (!c?.side || c.side === 'mixed') {
        return { ok: false, why: 'Aether could not say which way this one goes — nothing to build a lean on' }
    }
    const urg = urgencyOf(c, now)
    if (urg.key === 'moved') return { ok: false, why: 'the excess move has already happened — this is the part Aether exists to get in front of' }
    if (urg.key === 'stale') return { ok: false, why: 'old enough that the mechanism needs re-checking before it is sized' }
    if (c.expires_at) {
        const ms = new Date(`${c.expires_at}T00:00:00Z`).getTime()
        if (!Number.isNaN(ms) && ms <= now) return { ok: false, why: `expired ${c.expires_at} — its report has printed and the market has looked` }
    }
    return { ok: true, why: 'open Mentor with this name and everything Aether found on it' }
}

/**
 * The setup the user already has on this name, if any — the newest one that is not closed.
 *
 * MATCHED ON THE TICKER, in the workspace being looked at. A setup carries no memory of the
 * Aether event that seeded it (Mentor builds it from a conversation, and the seed is just
 * the user's first turn), so "you already built this" is answered by the book, not by the
 * hand-off: if there is a live setup on the name, the trade exists, whichever desk it came
 * from. A closed one is history and does not block a second look.
 */
// eslint-disable-next-line react-refresh/only-export-components -- pure, and the match is worth testing
export function existingSetupFor(ticker, setups = []) {
    const sym = String(ticker ?? '').toUpperCase()
    if (!sym) return null
    const live = setups.filter(s => String(s?.asset ?? '').toUpperCase() === sym && !isTerminal(s?.status))
    if (!live.length) return null
    const when = s => new Date(s.updatedAt ?? s.createdAt ?? 0).getTime() || 0
    return live.reduce((a, b) => (when(b) > when(a) ? b : a))
}

/** Where the setup is on its ladder, in the words a reader of this list expects. */
function setupStage(status) {
    if (isLivePosition(status))   return 'in position'
    if (isAwaitingConfirm(status)) return 'order placed'
    if (isArmed(status))           return 'armed'
    if (isUnarmed(status))         return 'built, not armed'
    return status || 'built'
}

/**
 * What the user says to Mentor on arrival — the calendar hand-offs' shape, spoken as the
 * USER's turn so the setup comes out of the conversation rather than from a briefing bubble.
 *
 * ONE DIFFERENCE FROM THE EARNINGS SEED: that one leaves direction open on purpose, because a
 * print is a date with no bias and picking a side is the judgment that belongs to the user.
 * Here the side IS the desk's read — `helped` or `hurt` is what Aether found — so the seed
 * states it as Aether's claim and the user's lean, and hands Mentor the job of examining it
 * rather than of guessing it. Mentor can still talk the user out of it; it just starts from
 * the claim rather than from nothing.
 *
 * Every line traces to a stored field. Nothing is paraphrased into a stronger claim: a
 * `silent` filing is said to be silent, an unmeasured move is said to be unmeasured.
 */
// eslint-disable-next-line react-refresh/only-export-components -- pure, and the copy is worth testing
export function buildAetherSeed(c, run = {}) {
    const side = c.side === 'hurt' ? 'short' : 'long'
    const label = SIDE[c.side]?.label ?? 'MIXED'
    const subject = run.subject || run.event || 'an event'
    const kind = run.event_category ? `${run.event_category}, ` : ''
    const when = (run.event_date || run.created_at || '').slice(0, 10)

    const lines = [
        `I want to build a swing setup on ${c.ticker}${c.company ? ` (${c.company})` : ''} off an Aether event — `
        + `${subject} (${kind}${when || 'date unknown'})${run.event ? `: "${run.event}"` : '.'}`,
        c.mechanism ? `Aether has it ${label}: ${c.mechanism}` : `Aether has it ${label}.`,
    ]
    if (c.press_evidence) {
        lines.push(`Press: ${c.press_evidence}${c.source_url ? ` (${c.source_url})` : ''}`)
    }
    if (c.verdict === 'quantified' || c.verdict === 'mentioned') {
        lines.push(`Its filings: ${c.verdict}${c.filing_evidence ? ` — "${c.filing_evidence}"` : ''}`)
    } else if (c.verdict === 'silent') {
        lines.push('Its filings: silent — nothing it has filed mentions this, which is information rather than an error.')
    } else if (c.verdict) {
        lines.push(`Its filings: ${c.verdict} — not read.`)
    }
    if (c.excess_pct != null) {
        const sigma = c.extension != null ? ` (${c.extension.toFixed(1)}σ of its own trailing move)` : ''
        lines.push(`Since the event it is ${pct(c.excess_pct)} vs SPY${sigma}${c.price_asof ? `, as of ${c.price_asof}` : ''} — still quiet.`)
    } else {
        lines.push('No move measured yet.')
    }
    if (c.expires_at) {
        const d = daysUntil(c.expires_at)
        lines.push(`Clock: it expires ${c.expires_at}${d != null ? ` (${d}d)` : ''}`
            + `${c.next_earnings ? `, at its next report` : ''} — the setup should be done by then.`)
    }
    // Prometheus's quick read, when one was asked for. Its verdict is the one thing Mentor cannot
    // get from Aether's fields, and a `contradicted` is exactly what should change the lean.
    if (c.quick_read?.verdict) {
        const q = c.quick_read
        lines.push(`Prometheus's quick read: ${QUICKREAD_LABEL[q.verdict] ?? q.verdict}`
            + `${q.confidence != null ? ` (${Math.round(q.confidence * 100)}% confidence)` : ''}`
            + `${q.read ? ` — ${q.read}` : ''}`)
    }
    // THE CLOSE FOLLOWS THE VERDICT. The lean is the user's, on Aether's read — but when
    // Prometheus has just read the name as contradicted or priced in, opening with "my lean
    // is short unless you see a reason not to" puts the user on record asserting the thing
    // the line above cut against, and asks Mentor for entry and invalidation on a trade it
    // has been handed a reason not to build. So the close asks the honest question instead:
    // is there still a setup here, or leave it. Credible and unclear keep the lean — one
    // confirms it, the other says nothing against it.
    const q = c.quick_read?.verdict
    if (q === 'contradicted') {
        lines.push(`Prometheus read that as contradicted — tell me whether there is still a ${side} setup here, or to leave it.`)
    } else if (q === 'priced_in') {
        lines.push(`Prometheus reads the move as already priced — tell me whether there is still a ${side} setup worth the entry from here, or to leave it.`)
    } else {
        lines.push(`My lean is ${side} unless you see a reason not to — take me through entry, invalidation and the window.`)
    }
    return lines.join('\n')
}

// ── Prometheus's quick read ───────────────────────────────────────────────────
//
// Optional, per name, never a gate. Mentor reads filings and news while it builds anyway; this is
// for the names the reader is unsure about — phases 1–2 of Prometheus on Sonnet, a few cents, a
// verdict and a paragraph, stored once per name per event and shown to everyone.
const QUICKREAD_LABEL = {
    credible:     'credible',
    priced_in:    'priced in',
    contradicted: 'contradicted',
    unclear:      'unclear',
}
// Why the trade waits while a read is in flight — the same words on the button and under it.
const READING_WHY = "waiting for Prometheus's read, so it rides in the seed"

const QUICKREAD_HINT = {
    credible:     'the mechanism holds and the record confirms it, and neither the estimates nor the price have absorbed it yet',
    priced_in:    'the exposure is real, but the estimates or a documented move show the market has already looked',
    contradicted: 'something the company said or filed since the event cuts against the mechanism',
    unclear:      'not enough to say either way — an honest answer, not a soft credible',
}

/**
 * The read when there is one, the button when there is not. Local state holds a read produced
 * on this screen until the next list refresh carries it on the candidate itself.
 *
 * `busy` LIVES IN THE ROW, not here, because the trade button below has to see it: the seed is
 * built at the moment Build is pressed, and a press while Prometheus is mid-read would hand
 * Mentor a seed without the verdict the user just asked for. The row disables the trade for
 * those seconds. A read that fails re-enables it — the seed simply carries no line.
 */
function QuickRead({ c, runId, read, onRead, busy, onBusy }) {
    const [err, setErr] = useState('')

    if (read?.verdict) {
        return (
            <div className={`aether-candidates__read aether-candidates__read--${read.verdict}`}
                 title={QUICKREAD_HINT[read.verdict] ?? ''}>
                <span className="aether-candidates__read-label">Prometheus</span>
                <strong className="aether-candidates__read-verdict">{QUICKREAD_LABEL[read.verdict] ?? read.verdict}</strong>
                {read.confidence != null && (
                    <span className="aether-candidates__read-conf">{Math.round(read.confidence * 100)}%</span>
                )}
                {read.read && <p className="floor-detail__prose">{read.read}</p>}
                {read.evidence?.length > 0 && (
                    <ul>
                        {read.evidence.map((e, i) => (
                            <li key={i}>{e.fact}{e.source ? <> — <em>{e.source}</em></> : null}</li>
                        ))}
                    </ul>
                )}
            </div>
        )
    }

    async function ask() {
        onBusy(true)
        setErr('')
        try {
            const r = await aetherService.quickRead(runId, c.ticker)
            onRead(r)
        } catch (e) {
            setErr(apiError(e, 'could not get a read'))
        } finally {
            onBusy(false)
        }
    }

    return (
        <div className="aether-candidates__act">
            <button
                type="button"
                className="aether-candidates__ask"
                disabled={busy}
                onClick={ask}
                title="Prometheus checks what the company has said or filed since the event, and the estimate trend — credible, priced in, or contradicted. One Sonnet call on your budget; the read is kept and shown to everyone."
            >
                {busy ? 'Prometheus is reading…' : 'Ask Prometheus'}
            </button>
            {err && <span className="aether-candidates__act-why">{err}</span>}
        </div>
    )
}

QuickRead.propTypes = {
    c: PropTypes.object.isRequired,
    runId: PropTypes.string,
    read: PropTypes.object,
    onRead: PropTypes.func.isRequired,
    busy: PropTypes.bool,
    onBusy: PropTypes.func.isRequired,
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
// WHAT EACH STAGE IS WORTH KNOWING FOR. The stages are wildly uneven — triage takes
// twenty seconds, the proposal took six and a half minutes on the Iran run, verification
// takes as long as EDGAR feels like — so one word for all of it says nothing, and a run
// that has died looks exactly like a run that is working.
const STAGE_LABEL = {
    starting:  'starting',
    triage:    'reading the news queue',
    selected:  'picking the events',
    proposing: 'naming companies',
    proposed:  'names proposed',
    verifying: 'checking filings',
    stored:    'saving',
}

const POLL_MS = 4000

/**
 * The run button. ADMIN ONLY, and hiding it is the courtesy — the server is the guard.
 *
 * It polls while a run is going, which is what lets it report a stage rather than just
 * "running" — and also what lets it know about a run THIS BROWSER did not start. Before,
 * a reload mid-run left the button reading "Run discovery" over a live engine, and the
 * only thing stopping a second press was the server's 409.
 */
function RunButton() {
    const { isAdmin } = useAuth() ?? {}
    const [state, setState] = useState('idle')     // idle | starting | running | failed
    const [progress, setProgress] = useState(null)
    const [why, setWhy] = useState('')
    // Whether THIS SERVER can spawn the engine. Starts null — unknown until the first
    // status read — so the button does not flash on for a host that cannot run it.
    const [available, setAvailable] = useState(null)

    // Poll whenever a run might be in flight, and once on mount to catch one already going.
    useEffect(() => {
        if (!isAdmin) return undefined
        let alive = true

        async function check() {
            try {
                const s = await aetherService.getDiscoveryStatus()
                if (!alive) return
                setProgress(s?.progress ?? null)
                setAvailable(s?.available !== false)
                if (s?.available === false) setWhy(s.unavailableReason ?? '')
                setState(cur => (s?.running ? 'running' : cur === 'running' ? 'idle' : cur))
            } catch { /* a status read failing is not worth surfacing over the button */ }
        }

        check()
        const timer = setInterval(check, POLL_MS)
        return () => { alive = false; clearInterval(timer) }
    }, [isAdmin])

    if (!isAdmin) return null
    // A CAPABILITY, NOT AN IDENTITY. Discovery spawns a Python process on the server's own
    // filesystem, so what decides the button is whether THIS host has an engine — never
    // which admin is looking. Gating on the person would be wrong twice over: it would
    // offer the run to whoever it named while they were on the deployed app, where nothing
    // can be spawned, and hide it from a second admin whose local checkout works. Two
    // admins, two hosts; the host is what differs.
    if (available === false) return null

    async function run() {
        setState('starting')
        try {
            await aetherService.startDiscovery()
            setState('running')
        } catch (err) {
            // 409 is "one is already going" — an answer, not a failure. Calling it failed
            // would invite exactly the second press the server just refused.
            if (err?.response?.status === 409) return setState('running')
            // Everything else is worth reading: no engine on this host, no resolvable
            // database. apiError is the one reader that finds the server's own message —
            // err.message alone is axios's "Request failed with status code 503".
            setWhy(apiError(err, 'could not start'))
            setState('failed')
        }
    }

    let label = 'Run discovery'
    if (state === 'starting') label = 'Starting…'
    else if (state === 'failed') label = 'Could not start — press to retry'
    else if (state === 'running') {
        const stage = STAGE_LABEL[progress?.stage] ?? 'running'
        // "event 2 of 2" only once the engine has actually reached one — before that the
        // count is the ceiling the run was given, not where it is.
        const which = progress?.event > 0 && progress?.events > 1
            ? ` · event ${progress.event} of ${progress.events}`
            : ''
        label = `${stage}${which}`
    }

    return (
        <button
            type="button"
            className="aether-candidates__run-btn"
            onClick={run}
            disabled={state === 'starting' || state === 'running'}
            title={state === 'failed' ? why
                : state === 'running' ? (progress?.detail ?? 'a run is in flight')
                : 'Reads the news queue, picks the events worth a run, and names the companies each reaches. Costs a model call per event plus an EDGAR pass per candidate, which is why it is not on a schedule.'}
        >
            {label}
        </button>
    )
}

/**
 * Every appearance of every ticker, one row per company.
 *
 * The server groups by run, which is the right shape for the list — and the wrong one for
 * the question "which names keep coming back". A company named by two events is saying
 * something neither event says alone, and only a ticker-keyed pass can see it. This is
 * that pass; the list stays event-first and reads recurrence off it.
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

/**
 * The names more than one event reached, most-recurring first.
 *
 * The strip above the list and the badge on the row both read from this. Count first,
 * because the strip's question is "what keeps coming back"; best rank breaks the tie so
 * the order never wobbles between renders.
 */
// eslint-disable-next-line react-refresh/only-export-components -- pure, and the ordering is worth testing directly
export function recurring(runs = []) {
    return byTicker(runs)
        .filter(r => r.appearances.length > 1)
        .sort((a, b) => b.appearances.length - a.appearances.length
                     || b.rank - a.rank
                     || a.ticker.localeCompare(b.ticker))
}

/**
 * The most recent event to reach this name.
 *
 * `event_date` is when the event TOOK EFFECT, which is the day the market could first
 * react and the day the move is measured from — so it is the date worth reading. It falls
 * back to `created_at` when the coverage stated no effective date, which is the same
 * fallback the engine's own _anchor() makes, and for the same reason: better the day it
 * was found than nothing.
 *
 * MAX, not the best appearance's. On a name reached twice the question is "how current is
 * this", and the freshest event is what makes it current — even if the older event is the
 * better-evidenced one.
 */
// eslint-disable-next-line react-refresh/only-export-components -- pure, and the fallback is worth testing
export function lastEventDate(row) {
    const days = (row?.appearances ?? [])
        .map(a => (a.event_date || a.created_at || '').slice(0, 10))
        .filter(Boolean)
    return days.length ? days.reduce((a, b) => (a > b ? a : b)) : ''
}

/** The day an event took effect, with the engine's own fallback to the day it was found. */
function eventDay(run) {
    return (run?.event_date || run?.created_at || '').slice(0, 10)
}

/** One line for a name's other events — the tooltip on the chip and on the row badge. */
function alsoNamedBy(row, exceptRunId = null) {
    return row.appearances
        .filter(a => a.run_id !== exceptRunId)
        .map(a => `${a.subject || a.event} (${SIDE[a.side]?.label ?? 'MIXED'}, ${a.verdict ?? '—'})`)
        .join(' · ')
}

// ── the scorecard ─────────────────────────────────────────────────────────────
//
// What the names did. Every candidate is a claim with an expiry, and the engine's nightly
// refresh grades each one at its print — hit, miss, flat, or unpriced — and writes one
// card. This is that card as one line, because the question it answers ("does this desk
// earn its keep?") is one a reader should meet before the names, not after.

/** `63%` from 0.636; `—` from null. A rate is never invented from a missing one. */
function rate(v) {
    return v == null ? '—' : `${Math.round(v * 100)}%`
}

/** `+1.4%` from 0.014 — signed, because the sign is the whole point of a mean move. */
function signedPct(v) {
    if (v == null) return '—'
    const s = (v * 100).toFixed(1)
    return `${v > 0 ? '+' : ''}${s}%`
}

/**
 * One line, and the splits on hover.
 *
 * THE TWO EMPTY STATES ARE DIFFERENT SENTENCES. Nothing graded with names pending is
 * "first grade on <date>" — a desk that has not been tested yet. Nothing graded and
 * nothing pending is a desk with nothing to test. And no card at all is the nightly not
 * having run, which is said as that rather than as either of the others.
 */
// eslint-disable-next-line react-refresh/only-export-components -- pure, and the copy is worth testing
export function scorecardLine(card) {
    if (card === null) return { text: 'no scorecard yet — the nightly refresh has not run', hint: '' }
    const o = card?.overall ?? {}
    if (!o.n) {
        return card?.pending
            ? { text: `scorecard · nothing graded yet · ${card.pending} pending, first grade ${card.next_expiry ? fmtShortDay(card.next_expiry) : 'unknown'}`,
                hint: 'A name is graded once, at its expiry — the next report after the event, when the market is forced to look.' }
            : { text: 'scorecard · nothing to grade', hint: '' }
    }
    const verdicts = Object.entries(card.by_verdict ?? {})
        .map(([k, v]) => `${k}: ${v.hit}/${v.hit + v.miss} hit`)
        .join(' · ')
    const survived = Object.entries(card.by_survived ?? {})
        .map(([k, v]) => `${k}: ${rate(v.hit_rate)}`)
        .join(' · ')
    return {
        text: `scorecard · ${o.n} graded · ${o.hit} hit / ${o.miss} miss / ${o.flat} flat`
            + `${o.unpriced ? ` / ${o.unpriced} unpriced` : ''} · ${rate(o.hit_rate)} of decided`
            + ` · ${signedPct(o.avg_signed_pct)} avg vs SPY${card.pending ? ` · ${card.pending} pending` : ''}`,
        hint: [verdicts && `by filing: ${verdicts}`, survived && `by survival: ${survived}`]
            .filter(Boolean).join('\n'),
    }
}

function Scorecard() {
    // undefined = not read yet; null = the engine has never written one; object = the card.
    const [card, setCard] = useState(undefined)
    useEffect(() => {
        let alive = true
        aetherService.getScorecard()
            .then(c => { if (alive) setCard(c ?? null) })
            .catch(() => { /* a card that will not load is not worth a line over the list */ })
        return () => { alive = false }
    }, [])
    if (card === undefined) return null
    const line = scorecardLine(card)
    return (
        <p className="aether-candidates__score" title={line.hint || undefined}>
            {line.text}
        </p>
    )
}

/**
 * The names more than one event reached, above the list.
 *
 * Event-first cannot show recurrence on its own — a name named by three events is one
 * row in each of three closed accordions — so the strip says it once, up front. It is the
 * one thing the ticker-first layout could show and this one could not, and the reason
 * the flip happened at all; it stays, in the form the event-first list can carry.
 */
function RecurrenceStrip({ rows, onSymbolClick }) {
    const [all, setAll] = useState(false)
    if (!rows.length) return null
    const shown = all ? rows : rows.slice(0, STRIP_MAX)
    return (
        <div className="aether-candidates__recur">
            <span className="aether-candidates__recur-label"
                  title="A company reached by two independent events is saying something neither event says alone.">
                named by more than one event
            </span>
            {shown.map(r => (
                <span key={r.ticker}
                      className={`aether-candidates__chip${r.conflicted ? ' aether-candidates__chip--conflicted' : ''}`}
                      title={`${r.ticker} — ${alsoNamedBy(r)}${r.conflicted ? ' — these events pull it in opposite directions' : ''}`}>
                    <SymbolCell className="aether-candidates__chip-sym" symbol={r.ticker} onSymbolClick={onSymbolClick} />
                    <span className="aether-candidates__chip-n">×{r.appearances.length}</span>
                    {r.conflicted && <span className="aether-candidates__chip-pm" aria-label="opposite directions">±</span>}
                </span>
            ))}
            {/* Never a silent cut — the count is on the button, and one click gets the rest. */}
            {rows.length > STRIP_MAX && (
                <button type="button" className="aether-candidates__chip aether-candidates__chip--more"
                        onClick={() => setAll(v => !v)}
                        title={all ? `back to the ${STRIP_MAX} most recurring` : 'every name more than one event reached'}>
                    {all ? 'fewer' : `+${rows.length - STRIP_MAX} more`}
                </button>
            )}
        </div>
    )
}

RecurrenceStrip.propTypes = {
    rows: PropTypes.array.isRequired,
    onSymbolClick: PropTypes.func,
}

/**
 * One name inside an open event: its row, and its drawer when open.
 *
 * `recur` is this ticker's row from byTicker() when more than one event reached it — the
 * badge on the line and the "also named by" jumps in the drawer both come from it, and a
 * jump opens the OTHER event, which is the one place the event-first list has to be able
 * to cross from one event to another.
 */
function NameRow({ c, run, recur, isOpen, onToggle, onJump, onSymbolClick, onTradeWithMentor, setup, onOpenSetup }) {
    const runId = run.run_id
    // A read produced on this screen, until the next list refresh carries it on `c` itself.
    const [localRead, setLocalRead] = useState(null)
    // One in flight. Held here rather than in QuickRead so the trade button can wait for it.
    const [reading, setReading] = useState(false)
    const read = c.quick_read ?? localRead
    const cRead = read ? { ...c, quick_read: read } : c

    // TO THE TOP WHEN OPENED, and pinned there (the scss). The drawer under a name runs past a
    // screen — mechanism, press, filing, the read, the move, the hand-off — and the row naming the
    // company you are reading about is the first thing to scroll away. Same mechanic as the event
    // row above it, one level down: the body is the scroll container, the row sticks to its top.
    //
    // THE BODY ONLY, not scrollIntoView. That scrolls every scrollable ancestor, and the list
    // itself is one: it carried the name to the top of the LIST and pushed the event row — the
    // pinned one — off the top of the screen. The body is the one scroller this row lives in.
    const hostRef = useRef(null)
    useEffect(() => {
        if (!isOpen) return
        const host = hostRef.current
        const body = host?.closest('.floor-sub__body')
        if (!host || !body) return
        body.scrollTop += host.getBoundingClientRect().top - body.getBoundingClientRect().top
    }, [isOpen])
    const dir = SIDE[c.side]?.dir ?? 'mixed'
    const urg = urgencyOf(c)
    const mag = magnitude(c)
    const hz = horizon(c)
    const others = recur ? recur.appearances.filter(a => a.run_id !== runId) : []
    const trade = tradable(c)

    return (
        <div ref={hostRef} className={`aether-candidates__name${isOpen ? ' aether-candidates__name--open' : ''}`}>
            <RowHost>
                <button
                    className="floor-row floor-row--sub"
                    onClick={onToggle}
                    aria-expanded={isOpen}
                    title={isOpen ? 'Hide the evidence' : 'Show why this name is here'}
                >
                    <svg className={`floor-row__chev${isOpen ? ' floor-row__chev--open' : ''}`}
                         viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5"
                              strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span className={`floor-row__dir floor-row__dir--${dir}`} aria-hidden="true">
                        {dir === 'short' ? '▾' : dir === 'long' ? '▴' : '±'}
                    </span>
                    <SymbolCell className="floor-row__sym" symbol={c.ticker} onSymbolClick={onSymbolClick} />
                    {/* The recurrence, riding directly after the name like every other count in
                        this column. `×3` rather than "(3 events)" because this row sits inside
                        an event already and the count is about the OTHER ones. */}
                    {others.length > 0 && (
                        <span className={`floor-row__count${recur.conflicted ? ' aether-candidates__count--conflicted' : ''}`}
                              title={`also named by ${others.length} other event${others.length > 1 ? 's' : ''}: ${alsoNamedBy(recur, runId)}${recur.conflicted ? ' — pulling in opposite directions' : ''}`}>
                            ×{others.length + 1}
                        </span>
                    )}
                    {/* A setup already exists on this name — said on the row, so the reader can
                        see which names are already trades without opening each one. */}
                    {setup && (
                        <span className="aether-candidates__built-chip"
                              title={`you already have a setup on ${c.ticker}: ${setup.direction ?? ''} · ${setupStage(setup.status)}`}>
                            setup
                        </span>
                    )}
                    <span className="floor-row__kind" title={hz.hint}>{hz.label}</span>
                    <span className="floor-row__score" title={mag.hint}>{mag.label}</span>
                    <span className={`floor-row__status floor-row__status--${urg.key}`} title={urg.hint}>
                        {urg.label}
                    </span>
                </button>
            </RowHost>

            {isOpen && (
                <div className="floor-detail">
                    <div className="floor-detail__block">
                        {c.mechanism && <p className="floor-detail__prose">{c.mechanism}</p>}

                        <ul>
                            {c.press_evidence && (
                                <li>
                                    {c.press_evidence}
                                    {c.source_url && (
                                        <> <a href={c.source_url} target="_blank" rel="noreferrer">source</a></>
                                    )}
                                </li>
                            )}
                            <li title={VERDICT_HINT[c.verdict]}>
                                <strong>{c.verdict}</strong>
                                {c.filing_evidence
                                    ? <> — “{c.filing_evidence}”</>
                                    : <em> — nothing in its filings mentions this, which is information rather than an error</em>}
                            </li>
                            {c.impact_pct_revenue != null && (
                                <li>{pct(c.impact_pct_revenue, 2)} of revenue, as the filing states it</li>
                            )}
                            {c.move_pct != null && (
                                <li>
                                    {pct(c.move_pct)} raw, <strong>{pct(c.excess_pct)} vs SPY</strong>
                                    {c.extension != null && <> · {c.extension.toFixed(1)}σ</>}
                                    {c.reaction && c.reaction !== 'unknown' && <> · {c.reaction}</>}
                                    {c.price_asof && <> · as of {c.price_asof}</>}
                                </li>
                            )}
                            {/* The other events, as jumps. A name two events pull opposite ways is
                                two live claims about one company, and the reader has to see the
                                other one before acting on this one. */}
                            {others.length > 0 && (
                                <li className="aether-candidates__also">
                                    also named by{' '}
                                    {others.map((a, i) => (
                                        <span key={a.run_id}>
                                            {i > 0 && ' · '}
                                            <button type="button"
                                                    className="aether-candidates__jump"
                                                    onClick={() => onJump(a.run_id)}
                                                    title={`open ${a.subject || a.event}`}>
                                                {a.subject || a.event}
                                            </button>
                                            {' '}({SIDE[a.side]?.label ?? 'MIXED'}, {a.verdict ?? '—'})
                                        </span>
                                    ))}
                                    {recur.conflicted && <em> — in the opposite direction</em>}
                                </li>
                            )}
                        </ul>

                        <div className="floor-detail__foot">
                            {c.next_earnings && (
                                <span>next report {c.next_earnings}
                                    {c.days_to_earnings != null && ` · ${c.days_to_earnings}d`}</span>
                            )}
                            {c.expires_at && <span>expires {c.expires_at}</span>}
                            {c.rank_parts && (
                                <span title="the rank is a sum you can take apart, not a score">
                                    rank {c.rank?.toFixed(1)} = {Object.entries(c.rank_parts)
                                        .filter(([, v]) => v)
                                        .map(([k, v]) => `${k} ${v}`)
                                        .join(' + ') || '—'}
                                </span>
                            )}
                        </div>

                        {/* Prometheus first, then the trade — the read is part of the why, and
                            a `contradicted` should be seen before the button is pressed. */}
                        <QuickRead c={c} runId={runId} read={read} onRead={setLocalRead}
                                   busy={reading} onBusy={setReading} />

                        {/* IN THE DRAWER, not on the row. The row's right edge is the score and
                            status cells, and an overlay there is how the old `open` button
                            charted a symbol when the reader reached for a label. Here it sits
                            under the evidence — the reader has read the why before being
                            offered the trade. Only where a Mentor exists to hand to: the Floor
                            renders this list too, and a test renders it with nothing behind it.

                            DISABLED WITH THE REASON rather than hidden: a name that has moved
                            or expired is still on the list, and "why can't I trade this one"
                            is a question the button can answer. */}
                        {/* ALREADY BUILT. A live setup on the name replaces the hand-off: the trade
                            exists, and building a second one from the same read is the mistake
                            this line is here to prevent. The setup opens from here instead. */}
                        {setup ? (
                            <div className="aether-candidates__act">
                                <span className="aether-candidates__built">
                                    setup already built — {c.ticker} {setup.direction ?? ''} · {setupStage(setup.status)}
                                </span>
                                <button type="button" className="aether-candidates__jump"
                                        onClick={() => onOpenSetup(setup)}
                                        title="open the setup">
                                    open
                                </button>
                            </div>
                        ) : onTradeWithMentor && (
                            <div className="aether-candidates__act">
                                <button
                                    type="button"
                                    className="aether-candidates__trade"
                                    disabled={!trade.ok || reading}
                                    title={reading ? READING_WHY : trade.why}
                                    onClick={() => onTradeWithMentor(c.ticker, buildAetherSeed(cRead, run))}
                                >
                                    Trade with Mentor →
                                </button>
                                {!trade.ok
                                    ? <span className="aether-candidates__act-why">{trade.why}</span>
                                    : reading && <span className="aether-candidates__act-why">{READING_WHY}</span>}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

NameRow.propTypes = {
    c: PropTypes.object.isRequired,
    run: PropTypes.object.isRequired,
    recur: PropTypes.object,
    isOpen: PropTypes.bool,
    onToggle: PropTypes.func.isRequired,
    onJump: PropTypes.func.isRequired,
    onSymbolClick: PropTypes.func,
    onTradeWithMentor: PropTypes.func,
    setup: PropTypes.object,
    onOpenSetup: PropTypes.func.isRequired,
}

/** What the event's filings said, for the row: "8/45 sized", with the run's own verdict on hover. */
function evidenceCell(run) {
    const ev = run.evidence
    if (!ev || !ev.n_survived) return { label: '—', hint: 'no names survived, so nothing to size' }
    return {
        label: `${ev.n_quantified}/${ev.n_survived} sized`,
        hint: ev.discloses
            ? `${ev.n_quantified} of ${ev.n_survived} names put a figure on it in their filings — an event of the kind companies disclose`
            : `${ev.n_quantified} of ${ev.n_survived} names put a figure on it — an event that does not land on a line item, so the names rest on the press mechanism`,
    }
}

export function AetherCandidates({ runs = [], loading, error = '', onSymbolClick, onTradeWithMentor, setups = [], onOpenSetup = openSetupPopup }) {
    // ONE EVENT OPEN AT A TIME, and folded siblings collapse to nothing. Not a preference —
    // it is the mechanic every other list in this column uses (3bbfa59), and a list that
    // expands differently from the four above it reads as a different kind of thing.
    const [openRun, setOpenRun] = useState(null)
    // One NAME open inside it, keyed by run and ticker so a jump to another event never
    // arrives with a drawer already open on the same ticker there.
    const [openName, setOpenName] = useState(null)
    // Which events have shown past their shortlist. Per event, because "33 more" is a
    // statement about one run's ranks, not about the screen.
    const [showAll, setShowAll] = useState({})

    const recur = useMemo(() => recurring(runs), [runs])
    const recurByTicker = useMemo(() => new Map(recur.map(r => [r.ticker, r])), [recur])

    const toggleRun = id => {
        setOpenRun(cur => (cur === id ? null : id))
        setOpenName(null)
    }
    const jumpTo = id => {
        setOpenRun(id)
        setOpenName(null)
    }
    const toggleName = key => setOpenName(cur => (cur === key ? null : key))

    if (loading) return <p className="floor-empty">Loading…</p>

    // A FAILED READ IS NOT AN EMPTY ONE. These were the same screen until 2026-09-10, when
    // a DNS wobble at Atlas took down every read in the app and this list reported a quiet
    // day — twice, costing two rounds of looking in the wrong place. An empty list is a
    // claim about the world; a failed fetch is a claim about the connection.
    if (error && !runs.length) {
        return (
            <div className="aether-candidates">
                <p className="floor-empty">
                    Could not read the candidate list — <strong>{error}</strong>.
                    <br />
                    The names are stored on the server; this is the read failing, not an empty
                    list. It retries on its own.
                </p>
                <div className="aether-candidates__bar"><RunButton /></div>
            </div>
        )
    }

    // The empty state is where the button matters most: nothing has run, and an admin is
    // the only one who can change that.
    if (!runs.length) {
        return (
            <div className="aether-candidates">
                <p className="floor-empty">
                    No events in the window. Aether names companies when a story breaks, and a run
                    is started by hand rather than on a schedule.
                </p>
                <div className="aether-candidates__bar"><RunButton /></div>
            </div>
        )
    }

    return (
        <div className="aether-candidates">
            <div className="aether-candidates__bar"><RunButton /></div>

            {/* A poll that failed OVER a list already on screen. The names stay — throwing
                away what the reader is looking at because a refresh five minutes later
                failed would be worse than showing it — but the list is now only as current
                as the last good read, and this line is the only thing that says so. */}
            {error && (
                <p className="aether-candidates__stale" title={error}>
                    not refreshing — {error}
                </p>
            )}

            {/* FOLDED WHILE AN EVENT IS OPEN, like the sibling events are. The Floor's mechanic is
                that the thing you opened takes the column and everything else gets out of the way;
                these two are context for the LIST — which names recur across events, how the desk
                has scored — and with them in place an open event sat a hundred pixels down under
                two rows of chips. Closing the event brings them back. */}
            {openRun === null && (
                <>
                    <Scorecard />
                    <RecurrenceStrip rows={recur} onSymbolClick={onSymbolClick} />
                </>
            )}

            {runs.map(run => {
                const isOpen = openRun === run.run_id
                const isFolded = openRun !== null && !isOpen
                const cands = run.candidates ?? []
                // THE SHORTLIST, and the rest one click away. Top N rather than a rank floor
                // because the ranks do not break: they descend 6.57, 6.27, 5.99, 5.91, 5.88 —
                // gaps of 0.03 to 0.31, no cliff to cut at. A floor would present a threshold
                // the evidence did not draw; a count is arbitrary and reads as arbitrary.
                const shown = showAll[run.run_id] ? cands : cands.slice(0, SHORTLIST)
                const when = eventDay(run)
                const ev = evidenceCell(run)
                const label = run.subject || run.event || run.run_id

                return (
                    <div
                        key={run.run_id}
                        className={`floor-sub${isOpen ? ' floor-sub--open' : isFolded ? ' floor-sub--folded' : ''}`}
                    >
                        <RowHost>
                            {/* ONE LINE, and the same cells the coverage and scan rows use, so the
                                five lists in this column scan as one column rather than five. */}
                            <button
                                className="floor-row"
                                onClick={() => toggleRun(run.run_id)}
                                aria-expanded={isOpen}
                                title={isOpen ? 'Hide the names' : (run.event || 'Show the names this event reached')}
                            >
                                <svg className={`floor-row__chev${isOpen ? ' floor-row__chev--open' : ''}`}
                                     viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                    <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5"
                                          strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                <span className="floor-row__sym floor-row__sym--wide">{label}</span>
                                <span className="floor-row__count"
                                      title={`${cands.length} name${cands.length === 1 ? '' : 's'} survived the gates`}>
                                    ({cands.length} {cands.length === 1 ? 'name' : 'names'})
                                </span>
                                {when && (
                                    <span className="floor-row__when" title={`the event took effect ${when}`}>
                                        {fmtShortDay(when)}
                                    </span>
                                )}
                                <span className="floor-row__kind" title={CATEGORY_HINT[run.event_category] ?? 'kind not recorded'}>
                                    {run.event_category || '—'}
                                </span>
                                <span className="floor-row__score" title={ev.hint}>{ev.label}</span>
                            </button>
                        </RowHost>

                        {isOpen && (
                            <div className="floor-sub__body">
                                {/* The event itself, once, as the model cleaned it — the names
                                    below answer this sentence. */}
                                {run.event && (
                                    <p className="aether-candidates__event" title={run.answer_shape ? `answer shape: ${run.answer_shape}` : undefined}>
                                        {run.event}
                                    </p>
                                )}

                                {!cands.length && (
                                    <p className="floor-empty">No names survived this event’s gates.</p>
                                )}

                                {shown.map(c => {
                                    const key = `${run.run_id}|${c.ticker}`
                                    return (
                                        <NameRow
                                            key={key}
                                            c={c}
                                            run={run}
                                            recur={recurByTicker.get(c.ticker)}
                                            isOpen={openName === key}
                                            onToggle={() => toggleName(key)}
                                            onJump={jumpTo}
                                            onSymbolClick={onSymbolClick}
                                            onTradeWithMentor={onTradeWithMentor}
                                            setup={existingSetupFor(c.ticker, setups)}
                                            onOpenSetup={onOpenSetup}
                                        />
                                    )
                                })}

                                {/* Never a silent truncation: a reader who cannot tell the list was
                                    cut cannot tell whether the cut was wrong. */}
                                {cands.length > SHORTLIST && (
                                    <button
                                        type="button"
                                        className="aether-candidates__more"
                                        onClick={() => setShowAll(cur => ({ ...cur, [run.run_id]: !cur[run.run_id] }))}
                                        title="Every name is stored, ranked and reachable — this only decides how many open on screen."
                                    >
                                        {showAll[run.run_id]
                                            ? `Show the top ${SHORTLIST}`
                                            : `${cands.length - SHORTLIST} more, lower ranked`}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}

AetherCandidates.propTypes = {
    runs: PropTypes.array,
    loading: PropTypes.bool,
    // The message from a failed read, '' when the last read succeeded. Not a boolean:
    // "could not reach the server" and "Could not read event candidates" send the reader
    // to different places.
    error: PropTypes.string,
    onSymbolClick: PropTypes.func,
    // (ticker, message) → opens Mentor with the message as the user's first turn. Absent where
    // there is no Mentor to hand to, and then no button is offered.
    onTradeWithMentor: PropTypes.func,
    // The workspace's setups — a live one on a name replaces the hand-off with "already built".
    setups: PropTypes.array,
    onOpenSetup: PropTypes.func,
}
