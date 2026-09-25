import { useState } from 'react'
import PropTypes from 'prop-types'
import { tidyPrices, guardLabel, nextCall } from './monitorJournal.utils.js'
import './TalosJournal.scss'

// ── Talos's journal ────────────────────────────────────────────────────────────
// One row per model read (docs/design/talos-per-candle.md), newest on top, each collapsed to the
// line that matters — when, why, what it decided, what it said — and opening to what it actually
// did: the conditions it checked, the tools it pulled, the guards it armed.
//
// Above the newest row sits THE NEXT CALL: when Talos looks next, on which candle, the prices that
// would wake it sooner, and its memo. That used to be a separate panel (TalosWatch); it is the head
// of the journal because that is what it is — the next line of the same monologue.
//
// The rows come from `useJournal` (their own collection, paged), not from the setup document.

const REASON_LABEL = {
    first_look:     'first look',
    candle:         'candle close',
    guard:          'level reached',
    expiry_review:  'expiry review',
    limit_order:    'limit order',
    limit_disarmed: 'order pulled',
    entry:          'filled',
    invalidation:   'range broken',
    exit:           'closed out',
    pre_active:     'not live yet',
    manage:         'you accepted',
}

// What the NEXT wake costs. A wake stopped being one thing on 2026-09-23 (backend talos.tiers):
// the full read, a numbers-only check, or nothing at all.
const NEXT_LABEL = {
    expensive: 'next read',
    cheap:     'next check',
    asleep:    'resting until',
}

// The MAP, which a read now answers apart from the moment — it can be waiting on a plan that still
// describes the chart, or waiting on one that has stopped.
const PREMISE_TITLE = {
    damaged: 'Talos says the premise is hurt — this may not be a trade any more',
    stale:   'Talos says the levels no longer describe this chart — it wants re-drawing',
}

const MET_MARK  = { yes: '✓', no: '✗', unchecked: '?' }
const MET_TITLE = {
    yes:       'Talos checked this and it is happening',
    no:        'Talos checked this and it is not happening',
    unchecked: "Talos could NOT check this — not the same as 'no'",
}

const fmtTime = (iso) => {
    const t = Date.parse(iso)
    return Number.isFinite(t) ? new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
}

/** The condition text lives on the setup; the row carries only { id, met, note }. Join them. */
function conditionText(setup, id) {
    const all = [
        ...(setup?.conditions ?? []),
        ...(setup?.scenarios ?? []).flatMap(sc => [
            ...(sc.conditions ?? []),
            ...(sc.entry_legs ?? []).flatMap(z => z.conditions ?? []),
            ...(sc.stop_legs  ?? []).flatMap(z => z.conditions ?? []),
            ...(sc.target_legs    ?? []).flatMap(z => z.conditions ?? []),
        ]),
    ]
    return all.find(c => c?.id === id)?.text ?? id
}

function JournalHead({ setup }) {
    const ms     = setup?.monitor_state ?? {}
    const guards = Array.isArray(ms.guards) ? ms.guards : []
    const { when, standing, tier, properIn } = nextCall(setup)
    if (!ms.memo && !when && !standing) return null
    return (
        <div className="talos-journal__head">
            {when && (
                <div className="talos-journal__summary talos-journal__summary--next">
                    <span className="talos-journal__time">{NEXT_LABEL[tier] ?? 'next read'}</span>
                    <span className="talos-journal__next">{when}</span>
                    {ms.timeframe && <span className="talos-journal__reason">{ms.timeframe} close</span>}
                    {properIn > 0 && (
                        <span className="talos-journal__chip" title="A full read — chart, structure, news. Talos set this pace itself, from how far the setup is from being decidable.">
                            full read in {properIn} {properIn === 1 ? 'close' : 'closes'}
                        </span>
                    )}
                    {guards.length > 0 && (
                        <span className="talos-journal__chip talos-journal__chip--guards" title="Prices that wake Talos ahead of the next candle">
                            or at {guards.map(guardLabel).filter(Boolean).join(' · ')}
                        </span>
                    )}
                </div>
            )}
            {standing && (
                <div className="talos-journal__summary talos-journal__summary--next">
                    <span className="talos-journal__time">talos</span>
                    <span className="talos-journal__next">{standing}</span>
                </div>
            )}
            {ms.memo && <p className="talos-journal__memo">{tidyPrices(ms.memo)}</p>}
        </div>
    )
}
JournalHead.propTypes = { setup: PropTypes.object }

function JournalRow({ row, setup }) {
    const [open, setOpen] = useState(false)
    const conditions = Array.isArray(row.conditions) ? row.conditions : []
    const tools      = Array.isArray(row.tools) ? row.tools : []
    const armed      = Array.isArray(row.armed) ? row.armed : []
    const hasDetail  = conditions.length > 0 || tools.length > 0 || armed.length > 0 || !!row.fired || !!row.proposal || !!row.warning

    return (
        <div className={`talos-journal__row talos-journal__row--${row.reason}${open ? ' is-open' : ''}`}>
            <button
                type="button"
                className="talos-journal__summary"
                onClick={() => hasDetail && setOpen(o => !o)}
                aria-expanded={hasDetail ? open : undefined}
                disabled={!hasDetail}
            >
                <span className="talos-journal__time">{fmtTime(row.at)}</span>
                <span className="talos-journal__reason">{REASON_LABEL[row.reason] ?? row.reason}</span>
                {row.price != null && <span className="talos-journal__price">@ {tidyPrices(String(row.price))}</span>}
                {row.tier === 'cheap' && (
                    <span className="talos-journal__verdict verdict--check" title="A numbers-only check — candles and indicators against the plan's conditions. No chart, no tools. It escalates to a full read the moment anything fires or it cannot tell.">
                        check
                    </span>
                )}
                {row.verdict && <span className={`talos-journal__verdict verdict--${row.verdict}`}>{row.verdict}</span>}
                {row.premise && row.premise !== 'intact' && (
                    <span className={`talos-journal__premise premise--${row.premise}`} title={PREMISE_TITLE[row.premise]}>
                        map {row.premise}
                    </span>
                )}
                {hasDetail && <span className="talos-journal__caret">{open ? '▾' : '▸'}</span>}
            </button>
            {row.note && <p className="talos-journal__note">{tidyPrices(row.note)}</p>}

            {open && (
                <div className="talos-journal__detail">
                    {row.warning && <p className="talos-journal__warning">{tidyPrices(row.warning)}</p>}
                    {row.fired && (
                        <div className="talos-journal__line">
                            <span className="talos-journal__k">woken by</span>
                            <span>{guardLabel(row.fired)}{row.fired.means ? ` (${row.fired.means})` : ''}{row.fired.armed_at ? ` — armed ${fmtTime(row.fired.armed_at)}` : ''}</span>
                        </div>
                    )}
                    {conditions.length > 0 && (
                        <ul className="talos-journal__conditions">
                            {conditions.map((c, i) => (
                                <li key={c.id ?? i} className={`met--${c.met ?? 'unchecked'}`}>
                                    <span className="talos-journal__met" title={MET_TITLE[c.met] ?? MET_TITLE.unchecked}>{MET_MARK[c.met] ?? '?'}</span>
                                    <span className="talos-journal__cond-body">
                                        <span className="talos-journal__cond-text">{conditionText(setup, c.id)}</span>
                                        {c.note && <span className="talos-journal__cond-note">{tidyPrices(c.note)}</span>}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {row.proposal && (
                        <div className="talos-journal__line">
                            <span className="talos-journal__k">proposed</span>
                            <span>{proposalLine(row.proposal)}</span>
                        </div>
                    )}
                    {tools.length > 0 && (
                        <div className="talos-journal__line">
                            <span className="talos-journal__k">pulled</span>
                            <span className="talos-journal__tools">{tools.join(' · ')}</span>
                        </div>
                    )}
                    {tools.length === 0 && (row.verdict || row.tier === 'cheap') && (
                        <div className="talos-journal__line">
                            <span className="talos-journal__k">pulled</span>
                            <span className="talos-journal__tools">
                                {row.tier === 'cheap' ? 'nothing — a check never pulls' : 'nothing — the candles answered'}
                            </span>
                        </div>
                    )}
                    {armed.length > 0 && (
                        <div className="talos-journal__line">
                            <span className="talos-journal__k">now watching</span>
                            <span>{armed.map(guardLabel).filter(Boolean).join(' · ')}</span>
                        </div>
                    )}
                    {row.rung && (
                        <div className="talos-journal__line">
                            <span className="talos-journal__k">rung</span>
                            <span>{row.rung}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
JournalRow.propTypes = { row: PropTypes.object.isRequired, setup: PropTypes.object }

function proposalLine(p) {
    if (Number.isFinite(p?.stop))     return `stop → ${p.stop}${p.why ? ` (${p.why})` : ''}`
    if (Number.isFinite(p?.quantity)) return `bank ${p.quantity}${p.leg ? ` (${p.leg})` : ''}`
    if (p?.leg)                       return `leg ${p.leg}`
    return JSON.stringify(p)
}

/**
 * @param {object}   setup     the setup, for the head and to join condition ids back to their text
 * @param {object[]} rows      newest first, from useJournal
 * @param {boolean}  done      no older rows exist
 * @param {boolean}  loading   an older page is in flight
 * @param {function} onOlder   fetch the next page
 */
export function TalosJournal({ setup, rows, done, loading, onOlder }) {
    const list = Array.isArray(rows) ? rows : []
    return (
        <section className="talos-journal" aria-label="Talos journal">
            <JournalHead setup={setup} />
            {list.length === 0
                ? <p className="talos-journal__empty">No reads yet — the journal fills in as Talos reads this setup on every candle close.</p>
                : list.map(row => <JournalRow key={row.at} row={row} setup={setup} />)}
            {list.length > 0 && !done && (
                <button type="button" className="talos-journal__older" onClick={onOlder} disabled={loading}>
                    {loading ? 'loading…' : 'older…'}
                </button>
            )}
        </section>
    )
}
TalosJournal.propTypes = {
    setup:   PropTypes.object,
    rows:    PropTypes.array,
    done:    PropTypes.bool,
    loading: PropTypes.bool,
    onOlder: PropTypes.func,
}
