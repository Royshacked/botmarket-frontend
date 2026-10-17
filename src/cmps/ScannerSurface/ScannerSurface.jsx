import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { LaterButton } from '../LaterButton.jsx'
import { aetherService } from '../../services/aether/aether.service.remote.js'
import { apiError } from '../../services/http.service.js'
import { useSurfacePress } from '../../customHooks/useSurfacePress.js'
import { ANGLES, anglePrompt, READ_FLAG, readFlagFor, summariseDropped, listKey } from './scannerSurface.utils.js'
import '../PortfolioPanel/PortfolioPanel.scss'
import '../ScannerPanel/ScannerPanel.scss'
import './ScannerSurface.scss'

// ── Argus's surface (unified-chat plan phase 8d) ─────────────────────────────
//
// What ScannerPanel drew beside its own chat, drawn from ARGUS'S STATE ON THE SESSION instead: the list in progress,
// the lens, the angle chips, the Prometheus read of a radar cut, and the Generate / Update / Later bar. The hand-off
// pick and the "research the top N" offer are not here — they are the chain's (a pick goes on by itself; the research
// offer is a decision card in the timeline).
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
    const { onSaved } = deskProps
    const { pressing, note, talk, press } = useSurfacePress(session, 'scanner', deskProps, { brand: 'Argus' })
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

    // ── the Prometheus read of a radar cut: it runs BY ITSELF on each list the cut puts up ──
    const [read, setRead] = useState({ key: null, busy: false, error: null })
    const live = useRef(null)      // the list a read in flight belongs to
    const skipped = useRef(null)   // a list saved without its read — its answer is discarded
    async function runRead(forKey) {
        if (!forKey) return
        live.current = forKey
        setRead({ key: forKey, busy: true, error: null })
        const tickers = forKey.split(',')
        try {
            const { rows = [] } = await aetherService.batchRead(tickers)
            if (live.current !== forKey || skipped.current === forKey) return
            let out = await session.edit('scanner', { read: { tickers, rows } })
            // A frame between the read and the hand-back moved the revision: once more on the current one. A list that
            // changed since is the server's `stale_read` — the next list gets its own read.
            if (!out.ok && out.reason === 'stale_state') out = await session.edit('scanner', { read: { tickers, rows } })
            const quiet = out.ok || ['stale_read', 'nothing_to_edit', 'stale_state'].includes(out.reason)
            if (live.current === forKey) setRead({ key: forKey, busy: false, error: quiet ? null : out.message })
        } catch (err) {
            if (live.current === forKey) setRead({ key: forKey, busy: false, error: apiError(err, 'the read failed') })
        }
    }
    // A verdict cleared on the SAME names is a list Argus re-emitted: read it again (phase 8d bug hunt #2) — what a name
    // is judged against is the set of events naming it, which the window can have moved. Re-reading costs nothing where
    // nothing changed (the stored read comes back without a model call).
    const handedBack = useRef(null)
    if (state?.readCut && key) handedBack.current = key
    useEffect(() => {
        if (!radar || !key || state?.readCut || turning) return
        // This list has its read — running, failed, or still to be handed back — unless its verdict came and went.
        if (read.key === key && handedBack.current !== key) return
        handedBack.current = null
        runRead(key)
    }, [radar, key, state?.readCut, turning]) // eslint-disable-line react-hooks/exhaustive-deps

    const cut = state?.readCut
        ? { ...state.readCut, flagged: (scan?.candidates ?? []).filter(c => readFlagFor(c)).length }
        : null
    const reading = read.busy && read.key === key

    function commit(action, done) {
        if (action === 'generate' && reading) skipped.current = key
        return press(action, { done }).then(out => {
            if (out?.ok) onSaved?.({ agent: 'scanner', action, result: out.result })
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
                    onClick={() => profile !== p && session.edit('scanner', { profile: p })}
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
                <button className="scanner-panel__angles-go" onClick={() => talk(anglePrompt([...angles]))}>
                    Scan {angles.size === 1 ? 'this' : 'these'} ({angles.size}) →
                </button>
            )}
        </div>
    )

    const noteLine = note && <p className={`scanner-surface__note scanner-surface__note--${note.kind}`} role={note.kind === 'error' ? 'alert' : 'status'}>{note.text}</p>

    if (!listReady && !editingId) {
        return (
            <div className="scanner-surface scanner-surface--empty">
                {noteLine}
                <p className="scanner-surface__lead">
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
        <div className="portfolio-panel scanner-panel scanner-surface">
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
                                <span className="portfolio-panel__build-summary-asset">{c.ticker}</span>
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

            {editingId && !listReady && <p className="scanner-surface__lead">Editing your list — ask Argus to add, remove or change names, then Update.</p>}

            {noteLine}

            {/* A read in flight holds the bar back: the one press on screen would save the list without the cut. */}
            {!turning && !reading && (
                <div className="portfolio-panel__action-bubble">
                    {listReady && (
                        <button className="portfolio-panel__review-btn portfolio-panel__review-btn--update" onClick={() => commit(editingId ? 'update' : 'generate', editingId ? () => 'The list is updated.' : () => 'The list is saved.')} disabled={pressing}>
                            {pressing ? 'Saving…' : editingId ? 'Update list' : 'Generate list'}
                        </button>
                    )}
                    {editingId && <LaterButton onClick={() => commit('later')} disabled={pressing} />}
                </div>
            )}

            {lens}
        </div>
    )
}

ScannerSurface.propTypes = {
    session: PropTypes.shape({
        agentState: PropTypes.object,
        agentRev:   PropTypes.object,
        live:       PropTypes.object,
        send:       PropTypes.func.isRequired,
        commit:     PropTypes.func.isRequired,
        edit:       PropTypes.func.isRequired,
    }).isRequired,
    deskProps: PropTypes.shape({
        // After a saved press: the page re-reads the lists.
        onSaved: PropTypes.func,
    }),
}
