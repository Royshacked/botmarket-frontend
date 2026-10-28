import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { LaterButton } from '../LaterButton.jsx'
import { aetherService } from '../../services/aether/aether.service.remote.js'
import { apiError } from '../../services/http.service.js'
import { useSurfacePress } from '../../customHooks/useSurfacePress.js'
import { SurfaceNote } from '../SidePane/SurfaceNote.jsx'
import { ChatActions } from '../SidePane/ChatActions.jsx'
import { DiscardButton } from '../SidePane/DiscardButton.jsx'
import { ANGLES, anglePrompt, READ_FLAG, readFlagFor, summariseDropped, listKey } from './scannerSurface.utils.js'
import '../PortfolioPanel/PortfolioPanel.scss'
import '../ScannerPanel/ScannerPanel.scss'
import './ScannerSurface.scss'

// ── Argus's surface (unified-chat plan phase 8d) ─────────────────────────────
//
// What ScannerPanel drew beside its own chat, drawn from ARGUS'S STATE ON THE SESSION instead: the list in progress,
// the lens, the angle chips, the Prometheus read of a radar cut, and the Generate / Update / Later bar. The hand-off
// pick and the "research the top N" offer are not here — they are the chain's (a pick goes on by itself; the research
// offer is a decision card in the timeline, and it saves the list before the run).
//
// THE PRESSES (backend plan §10.2): an angle is a TURN; the lens is a HAND EDIT; Generate / Update / Later are
// COMMITS. The Prometheus read runs on its own route (minutes long — it cannot hold the session lock) and hands its
// rows back as a HAND EDIT, applied by the server only to the list it was read for.

/** The Prometheus leg of a radar cut — a step, not a gate: the list can be saved without it. */
export function PrometheusStep({ names, cut, busy, error, onRead, onSkip }) {
    if (error) {
        return (
            <div className="scanner-panel__read-step">
                <span className="scanner-panel__read-note scanner-panel__read-note--err">The read failed — {error}. The list is untouched.</span>
                <button className="portfolio-panel__review-btn portfolio-panel__review-btn--later" onClick={onRead} disabled={busy}>Try again</button>
            </div>
        )
    }
    if (!cut) {
        return (
            <div className="scanner-panel__read-step">
                <button
                    className="portfolio-panel__review-btn portfolio-panel__review-btn--later"
                    onClick={onRead}
                    disabled={busy || !names}
                    title="Prometheus reads each name against what the company has said or filed since its event: credible, already priced in, or contradicted — and which way the name goes across every event naming it. One model call per name, on your budget."
                >
                    {busy ? `Prometheus is reading ${names}…` : `Read these ${names} with Prometheus`}
                </button>
                {/* THE WAY OUT of a wait nobody chose: the read fires by itself and is minutes long. What lands after
                    this press is discarded, not applied. */}
                {busy && onSkip && (
                    <button
                        className="portfolio-panel__review-btn portfolio-panel__review-btn--dismiss"
                        onClick={onSkip}
                        title="Keep the list as Argus cut it and save it now. The reads already paid for are stored either way."
                    >
                        Save without the read
                    </button>
                )}
            </div>
        )
    }
    // NOTHING SURVIVED, and the list above is still the one Argus cut — which names were refused and why is the answer.
    if (!cut.survived) {
        return (
            <div className="scanner-panel__read-step">
                <span className="scanner-panel__read-note">
                    Prometheus refused all {cut.dropped.length}: {summariseDropped(cut.dropped)}. The list above is unchanged — nothing here is worth a long today.
                </span>
            </div>
        )
    }
    return (
        <div className="scanner-panel__read-step">
            <span className="scanner-panel__read-note">
                {cut.dropped.length ? <>Prometheus dropped {cut.dropped.length} — {summariseDropped(cut.dropped)}.</> : <>Prometheus kept every name.</>}
                {cut.flagged > 0 && <> {cut.flagged} kept with a caveat.</>}
            </span>
        </div>
    )
}

PrometheusStep.propTypes = {
    names:  PropTypes.number,
    cut:    PropTypes.object,
    busy:   PropTypes.bool,
    error:  PropTypes.string,
    onRead: PropTypes.func,
    onSkip: PropTypes.func,
}

export function ScannerSurface({ session, deskProps = {} }) {
    const { onSaved, onTicker } = deskProps
    const { pressing, note, talk, press, edit } = useSurfacePress(session, 'scanner', deskProps, { brand: 'Argus' })
    const state   = session?.agentState?.scanner ?? null
    const turning = !!session?.live

    const scan      = state?.pendingScan ?? null
    const listReady = !!scan?.candidates?.length
    const editingId = state?.editingScanId ?? null
    const profile   = state?.profile === 'investing' ? 'investing' : 'trading'
    const handoff   = state?.handoff === true
    const radar     = state?.radar === true
    const key       = listKey(scan)

    const [angles, setAngles] = useState(() => new Set())
    const toggle = (label) => setAngles(prev => { const next = new Set(prev); next.has(label) ? next.delete(label) : next.add(label); return next })
    // Sent → the selection is spent (the panel kept it for a refine; the strip only shows before a list now).
    const scanAngles = () => { talk(anglePrompt([...angles])); setAngles(new Set()) }

    // ── the Prometheus read of a radar cut: it runs BY ITSELF on each list the cut puts up ──
    const [read, setRead] = useState({ key: null, busy: false, error: null })
    const live    = useRef(null)    // the list a read in flight belongs to — null once the surface is gone
    const skipped = useRef(null)    // a list SAVED without its read — its answer is discarded
    const sessionRef = useRef(session)
    sessionRef.current = session
    // A verdict came back since this read started — so a cleared one is a list Argus re-emitted (phase 8d CR): the
    // names, the same or not, are read again.
    const verdictSeen = useRef(false)
    if (state?.readCut) verdictSeen.current = true
    useEffect(() => () => { live.current = null }, [])

    async function runRead(forKey) {
        if (!forKey) return
        live.current = forKey
        skipped.current = null
        verdictSeen.current = false
        const sid = sessionRef.current?.sessionId
        setRead({ key: forKey, busy: true, error: null })
        const tickers = forKey.split(',')
        const settle = (error = null) => { if (live.current === forKey) setRead({ key: forKey, busy: false, error }) }
        try {
            const { rows = [] } = await aetherService.batchRead(tickers)
            // The answer belongs to the list it was read for, in the session it was read in — a list saved without
            // it, a surface closed, a new session: discarded (the read is stored server-side either way).
            if (live.current !== forKey || skipped.current === forKey || sessionRef.current?.sessionId !== sid) return settle()
            const change = { read: { tickers, rows } }
            const hand = (rev) => (rev != null ? sessionRef.current.edit('scanner', change, { rev }) : sessionRef.current.edit('scanner', change))
            let out = await hand()
            // A frame between the read and the hand-back moved the revision: once more, on the revision the refusal
            // named (the one on screen is a render behind). A list that changed since is the server's `stale_read`.
            if (!out.ok && out.reason === 'stale_state') out = await hand(Number.isInteger(out.extra?.rev) ? out.extra.rev : null)
            settle(out.ok || ['stale_read', 'nothing_to_edit'].includes(out.reason) ? null : out.message)
        } catch (err) {
            settle(apiError(err, 'the read failed'))
        }
    }
    useEffect(() => {
        if (!radar || !key || state?.readCut || turning) return
        // This list has its read — running, failed, or still to be handed back — unless a verdict came and went.
        if (read.key === key && !verdictSeen.current) return
        runRead(key)
    }, [radar, key, state?.readCut, turning]) // eslint-disable-line react-hooks/exhaustive-deps

    const cut = state?.readCut
        ? { ...state.readCut, flagged: (scan?.candidates ?? []).filter(c => readFlagFor(c)).length }
        : null
    const reading = read.busy && read.key === key

    function commit(action, done) {
        const during = action === 'generate' && reading ? key : null
        return press(action, { done }).then(out => {
            if (!out?.ok) return
            // Only a list that WAS saved without its read discards the read's answer — a refused save leaves the read
            // to land and apply (phase 8d CR).
            if (during) { skipped.current = during; setRead(r => (r.key === during ? { ...r, busy: false } : r)) }
            if (action !== 'later') onSaved?.({ agent: 'scanner', action, result: out.result })
        })
    }

    const lens = !handoff && (
        <div className="scanner-panel__profiles" role="group" aria-label="Scan lens">
            <span className="scanner-panel__profiles-label">lens</span>
            {['trading', 'investing'].map(p => (
                <button
                    key={p}
                    type="button"
                    className={`scanner-panel__profile-chip${profile === p ? ' is-active' : ''}`}
                    onClick={() => profile !== p && edit({ profile: p })}
                    disabled={turning}
                    title={p === 'trading' ? 'Technical / catalyst setups → a trade with Mentor' : 'Fundamental / quality candidates → research with Prometheus'}
                >{p === 'trading' ? 'Trading' : 'Investing'}</button>
            ))}
        </div>
    )

    // Every angle is a trading setup — the wrong question to put in front of a portfolio scan.
    const angleStrip = !turning && !listReady && !editingId && !handoff && profile === 'trading' && (
        <div className="scanner-panel__angles-bar">
            <span className="scanner-panel__angles-hint scanner-panel__angles-hint--inline">scan by setup:</span>
            <div className="scanner-panel__angles">
                {ANGLES.map(a => (
                    <button
                        key={a.label}
                        className={`scanner-panel__angle${angles.has(a.label) ? ' scanner-panel__angle--on' : ''}`}
                        onClick={() => toggle(a.label)}
                        aria-pressed={angles.has(a.label)}
                    >{a.label}</button>
                ))}
            </div>
            {angles.size > 0 && (
                <button className="scanner-panel__angles-go" onClick={scanAngles}>
                    Scan {angles.size === 1 ? 'this' : 'these'} ({angles.size}) →
                </button>
            )}
        </div>
    )

    if (!listReady && !editingId) {
        return (
            <div className="desk-surface scanner-surface">
                <SurfaceNote note={note} />
                <p className="desk-surface__lead">
                    {handoff
                        ? 'Argus is finding one name to trade — it goes on to Mentor by itself once it is settled.'
                        : radar
                            ? 'Argus is cutting the radar board — the list appears here.'
                            : 'Tell Argus what to scan for in the chat, or pick a setup:'}
                </p>
                {angleStrip}
                {lens}
            </div>
        )
    }

    return (
        <div className="portfolio-panel scanner-panel desk-surface scanner-surface">
            {listReady && (
                <div className="portfolio-panel__build-summary">
                    <div className="portfolio-panel__build-summary-header">
                        <span className="portfolio-panel__build-summary-title">{editingId ? 'editing list —' : 'your list —'}</span>
                        <span className="portfolio-panel__build-summary-name">{scan.thesis}</span>
                        {scan.period?.label && <span className="scanner-panel__period-chip">{scan.period.label}</span>}
                        <span className="portfolio-panel__build-summary-count">{scan.candidates.length} {scan.candidates.length === 1 ? 'asset' : 'assets'}</span>
                    </div>
                    <div className="portfolio-panel__build-summary-items">
                        {scan.candidates.map(c => (
                            <span key={c.ticker} className="portfolio-panel__build-summary-item">
                                <span className={`scanner-panel__dir scanner-panel__dir--${c.direction}`}>{c.direction === 'short' ? '▾' : '▴'}</span>
                                {/* A name on the list opens its chart (the panel's ticker chips did). */}
                                <button type="button" className="portfolio-panel__build-summary-asset scanner-surface__ticker" onClick={() => onTicker?.(c.ticker)} title={`Chart ${c.ticker}`}>
                                    {c.ticker}
                                </button>
                                {/* The flag rides ON the name — it is a caveat about THAT name. */}
                                {readFlagFor(c) && (
                                    <span className="scanner-panel__read-flag" title={c.prometheus?.why}>{READ_FLAG[readFlagFor(c)] ?? readFlagFor(c)}</span>
                                )}
                            </span>
                        ))}
                    </div>
                    {radar && (
                        <PrometheusStep
                            names={scan.candidates.length}
                            cut={cut}
                            busy={reading}
                            error={read.key === key ? read.error : null}
                            onRead={() => runRead(key)}
                            onSkip={() => commit('generate', () => 'The list is saved, as Argus cut it.')}
                        />
                    )}
                </div>
            )}

            {editingId && !listReady && <p className="desk-surface__lead">Editing your list — ask Argus to add, remove or change names, then Update.</p>}

            <SurfaceNote note={note} />

            {/* A read in flight holds the bar back: the one press on screen would save the list without the cut. EDITING, the
                bar is always there instead (Roy, 2026-10-18) — dark while Argus answers or a read runs, lit once there is a
                list to save. */}
            {(editingId || (!turning && !reading)) && (
                <ChatActions><div className="portfolio-panel__action-bubble desk-surface__bar">
                    {(listReady || editingId) && (
                        <button className="portfolio-panel__review-btn portfolio-panel__review-btn--update" onClick={() => commit(editingId ? 'update' : 'generate', editingId ? () => 'The list is updated.' : () => 'The list is saved.')} disabled={pressing || turning || reading || !listReady}>
                            {pressing ? 'Saving…' : editingId ? 'Update list' : 'Generate list'}
                        </button>
                    )}
                    {editingId && <LaterButton onClick={() => commit('later')} disabled={pressing || turning} />}
                    {!editingId && listReady && <DiscardButton what="this list" onDiscard={() => press('discard', { done: () => 'Discarded — Argus\'s table is clear.' })} disabled={pressing} />}
                    {editingId && (turning || reading) && <span className="mentor-panel__missing">{reading ? 'Prometheus is reading the cut…' : 'Argus is answering…'}</span>}
                </div></ChatActions>
            )}

            {lens}
        </div>
    )
}

// What this pane is, said once under its tabs (SidePane — Roy, 2026-10-19: the pane was not clear to a user).
ScannerSurface.paneHint = 'What Argus finds for you lands here: a list the button at the bottom saves, or one name it hands back to Mentor.'

ScannerSurface.propTypes = {
    session: PropTypes.shape({
        sessionId:  PropTypes.string,
        agentState: PropTypes.object,
        agentRev:   PropTypes.object,
        live:       PropTypes.object,
        send:       PropTypes.func.isRequired,
        commit:     PropTypes.func.isRequired,
        edit:       PropTypes.func.isRequired,
    }).isRequired,
    deskProps: PropTypes.shape({
        // After a saved press: the page re-reads the lists.
        onSaved:  PropTypes.func,
        // A name on the list → its chart.
        onTicker: PropTypes.func,
    }),
}
