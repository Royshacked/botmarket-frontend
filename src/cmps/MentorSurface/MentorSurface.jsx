import { useCallback, useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { AccountSelector } from '../AccountSelector/AccountSelector.jsx'
import { LaterButton, LATER_BTN_CLASS } from '../LaterButton.jsx'
import { SuggestionChips } from '../SuggestionChips.jsx'
import { CoverageChips } from '../MentorPanel/CoverageChips.jsx'
import { SetupSummary } from '../MentorPanel/SetupSummary.jsx'
import { setupDigest } from '../MentorPanel/setupSummary.utils.js'
import { CandidatePicker } from '../MentorPanel/CandidatePicker.jsx'
import { SpanTable } from '../MentorPanel/SpanTable.jsx'
import { EntryTable } from '../MentorPanel/EntryTable.jsx'
import { StageConfirm } from '../MentorPanel/StageConfirm.jsx'
import { liveReadiness, candidatePress, stagePress, spansPress, entriesPress, delegatePress, revivePress, batchNames } from './mentorSurface.utils.js'
import '../PortfolioPanel/PortfolioPanel.scss'
import '../MentorPanel/MentorPanel.scss'
import './MentorSurface.scss'

// ── Mentor's surface (unified-chat plan phase 8b) ────────────────────────────
//
// What MentorPanel drew beside its own chat, drawn from MENTOR'S STATE ON THE SESSION instead: the worksheet, the
// coverage chips, the candidate offer, the open gate, and the Generate / Arm / Update bar. The conversation is the
// timeline's; nothing here holds a copy of it.
//
// THREE KINDS OF PRESS, each down its own path (backend plan §10.2):
//   • a gate or a pick is a TURN — the press's ops ride a message to Mentor, settled server-side before it reads;
//   • a worksheet field is a HAND EDIT — sent to the state, re-judged there (readiness and gate come back);
//   • Generate / Arm / Update / Later are COMMITS — the server saves what is in the session, never a copy from here.
// Every one names the revision the user was looking at; a stale press is refused, and the surface redraws.

const SUGGESTIONS = [
    'I want to buy NVDA on a pullback',
    "I'm thinking of shorting TSLA this week",
]
// The user who is not here to talk — a sentence like the others, named for what it is.
const OWN_SETUP_CHIP = 'I have my own setup — take it down as I give it'

/** A Generate-all's news: what was saved, and each plan refused with its reason (partial success is the contract). */
function batchReport(result) {
    const saved = result?.setups?.length ?? 0
    const failed = result?.failed ?? []
    return failed.length
        ? `${saved} saved. ${failed.length} not: ${failed.map(f => `${f.asset ?? `#${f.index + 1}`} — ${f.reason}`).join('; ')}`
        : `${saved} saved.`
}

// A hand edit is sent after the typing stops, one at a time: a PATCH per keystroke would race its own revisions.
const EDIT_SETTLE_MS = 600

/**
 * The worksheet's hand edits: a local copy while the user types, sent once they pause, one PATCH in flight. A server
 * draft that moves while nothing is pending (a turn landed) replaces the local copy.
 */
function useDraftEditor(serverDraft, push) {
    const [local, setLocal] = useState(serverDraft)
    const pending = useRef(null)
    const inFlight = useRef(false)
    const timer = useRef(null)

    useEffect(() => {
        if (!pending.current && !inFlight.current) setLocal(serverDraft)
    }, [serverDraft])
    useEffect(() => () => clearTimeout(timer.current), [])

    const flush = useCallback(async () => {
        if (inFlight.current || !pending.current) return
        const next = pending.current
        pending.current = null
        inFlight.current = true
        await push(next)
        inFlight.current = false
        if (pending.current) flush()
    }, [push])

    const change = useCallback((next) => {
        setLocal(next)
        pending.current = next
        clearTimeout(timer.current)
        timer.current = setTimeout(flush, EDIT_SETTLE_MS)
    }, [flush])

    /** Drop what was typed and stand on the server's draft again (a refused edit). */
    const reset = useCallback(() => { pending.current = null; clearTimeout(timer.current); setLocal(serverDraft) }, [serverDraft])

    return { draft: local, change, reset }
}

export function MentorSurface({ session, deskProps = {} }) {
    const { availableAccounts = [], selectedAccounts = [], setSelectedAccounts, mainAccountId = null, setMainAccountId } = deskProps
    const accounts = availableAccounts.filter(a => selectedAccounts.includes(a.id))
    const state = session?.agentState?.mentor ?? null

    const serverDraft = state?.draft ?? null
    const coverage    = state?.coverage ?? []
    const drafts      = state?.drafts ?? {}
    const gate        = state?.view?.gate ?? null
    const readiness   = state?.view?.readiness ?? null
    const candidates  = state?.view?.setups?.candidates ?? null
    const generated   = state?.generated ?? null
    const editingId   = state?.editing?.kind === 'setup' ? state.editing.entityId : null
    // A turn running anywhere: the gates and the worksheet wait for it — what they show is about to change.
    const turning     = !!session?.live

    const [pressing, setPressing] = useState(false)
    const [note, setNote]         = useState(null)   // { kind: 'error'|'done', text }
    const [previewOpen, setPreviewOpen] = useState(false)

    // Mentor's table moved on — a note about the last one no longer applies.
    // A STALE note stays: the replay that follows it redraws the plan, and that redraw is what the note points at.
    useEffect(() => { setNote(n => (n?.kind === 'error' && !n.stale ? null : n)) }, [serverDraft, gate, generated])

    // A refused edit puts the server's draft back — read through a ref, the editor is made with this callback.
    const resetEdit = useRef(null)
    const pushEdit = useCallback(async (draft) => {
        const out = await session.edit('mentor', { draft, accounts })
        if (!out.ok) {
            setNote(out.reason === 'stale_state'
                ? { kind: 'error', stale: true, text: 'Mentor moved on while you were typing — your edit was not saved.' }
                : { kind: 'error', text: out.message })
            resetEdit.current?.()
        }
    }, [session, accounts])
    const editor = useDraftEditor(serverDraft, pushEdit)
    resetEdit.current = editor.reset
    const draft = editor.draft

    // "Change something" on the opening card: the card steps aside so the user can say it — until Mentor puts a new
    // proposal up (a different gate), which is shown again.
    const [setAside, setSetAside] = useState(null)
    const gateKey = gate ? JSON.stringify(gate) : null

    // UPDATE ONLY ONCE THE PLAN MOVED. An update re-runs the venue gate and sends a watched setup back to `waiting`,
    // so pressing it on an unchanged plan would stop Talos watching for nothing. The baseline is the plan as it
    // reopened, held per setup.
    const baseline = useRef({ id: null, json: null })
    if (editingId && baseline.current.id !== editingId && serverDraft) baseline.current = { id: editingId, json: JSON.stringify(serverDraft) }
    if (!editingId && baseline.current.id) baseline.current = { id: null, json: null }
    const dirty = !!editingId && JSON.stringify(draft) !== baseline.current.json

    const talk = useCallback((text, ops = []) => {
        setNote(null)
        return session.send(text, { agent: 'mentor', ...(ops.length ? { ops } : {}), accounts, mainAccountId })
    }, [session, accounts, mainAccountId])
    const press = (p) => { if (p) talk(p.text, p.ops) }

    async function commit(action, done) {
        if (pressing) return
        setPressing(true)
        setNote(null)
        const out = await session.commit('mentor', action, { accounts, mainAccountId })
        setPressing(false)
        if (out.ok) { if (done) setNote({ kind: 'done', text: done(out.result) }); return }
        if (out.reason === 'stale_state') { setNote({ kind: 'error', stale: true, text: 'Mentor moved on while you were looking — check the plan and press again.' }); return }
        const failed = out.extra?.failed
        setNote({ kind: 'error', text: failed?.length
            ? `Nothing was saved: ${failed.map(f => `${f.asset ?? `#${f.index + 1}`} — ${f.reason}`).join('; ')}`
            : out.message })
    }

    const live = liveReadiness(readiness, accounts.length)
    const names = batchNames(draft, drafts)
    const hasPreview = !!draft?.asset
    const missing = live.blockers.filter(b => b.kind === 'missing')
    const problems = live.blockers.filter(b => b.kind === 'problem')

    // ── Nothing on the table ──
    if (!state || (!draft && !generated && !candidates?.length && !coverage.length)) {
        return (
            <div className="mentor-surface mentor-surface--empty">
                {note?.kind === 'done' && <p className="mentor-surface__note mentor-surface__note--done">{note.text}</p>}
                <p className="mentor-surface__lead">Nothing on Mentor&apos;s table. Tell Mentor about a trade in the chat, or start here:</p>
                <SuggestionChips
                    variant="intro"
                    disabled={turning}
                    onPick={(t) => talk(t)}
                    suggestions={[
                        ...SUGGESTIONS,
                        { label: OWN_SETUP_CHIP, title: 'Bring your own plan — Mentor takes it down as you give it', action: true, onPick: () => talk(OWN_SETUP_CHIP) },
                    ]}
                />
            </div>
        )
    }

    return (
        <div className="portfolio-panel mentor-panel mentor-surface">
            {setSelectedAccounts && (
                <div className="mentor-surface__accounts">
                    <AccountSelector
                        accounts={availableAccounts}
                        selectedIds={selectedAccounts}
                        onChange={setSelectedAccounts}
                        mainAccountId={mainAccountId}
                        onMainChange={setMainAccountId}
                    />
                </div>
            )}

            {(hasPreview || coverage.length > 0) && (
                <div className={`portfolio-panel__build-summary mentor-panel__build${previewOpen ? ' is-open' : ''}`}>
                    <div className="mentor-panel__build-head">
                        {/* WHICH setup, when there is a particular one — an edit is a mode, and it says so. */}
                        {hasPreview ? (
                            <button
                                type="button"
                                className="mentor-panel__build-toggle"
                                onClick={() => setPreviewOpen(open => !open)}
                                aria-expanded={previewOpen}
                                title={previewOpen ? 'Fold the setup away' : 'Open the full setup'}
                            >
                                <span className="mentor-panel__build-caret" aria-hidden="true">{previewOpen ? '▾' : '▸'}</span>
                                <span className="portfolio-panel__build-summary-title">
                                    {editingId ? `editing ${draft?.asset ?? 'this setup'}` : 'your setup'}
                                </span>
                                {!previewOpen && <span className="mentor-panel__build-digest">{setupDigest(draft)}</span>}
                            </button>
                        ) : (
                            <span className="portfolio-panel__build-summary-title">{editingId ? 'editing this setup' : 'your setup'}</span>
                        )}
                        <CoverageChips coverage={coverage} />
                    </div>
                    {hasPreview && previewOpen && (
                        <SetupSummary setup={draft} onChange={editor.change} readOnly={!!generated || turning} />
                    )}
                </div>
            )}

            {!turning && candidates?.length > 0 && (
                <CandidatePicker candidates={candidates} onPick={(c) => press(candidatePress(c))} />
            )}

            {/* The opening turn's answer, then the gate the SERVER says is open — never one keyed on what the draft
                happens to carry, or a chosen gate would sit there reading as a second ask. */}
            {!turning && (
                <StageConfirm
                    gate={gateKey === setAside ? null : gate}
                    busy={pressing}
                    onConfirm={(fields, waiver) => press(stagePress(fields, waiver))}
                    onChange={() => setSetAside(gateKey)}
                />
            )}
            {!turning && !candidates?.length && gate?.stage === 'spans' && (
                <SpanTable
                    spans={draft?.spans}
                    busy={pressing}
                    onBuild={(chosen) => press(spansPress(chosen))}
                    onRevive={(r) => press(revivePress(r))}
                    onDelegate={() => press(delegatePress('spans'))}
                />
            )}
            {!turning && !candidates?.length && gate?.stage === 'entries' && (
                <EntryTable
                    entries={draft?.entries}
                    spans={draft?.spans}
                    busy={pressing}
                    onTake={(chosen) => press(entriesPress(chosen))}
                    onDelegate={() => press(delegatePress('entries'))}
                />
            )}

            {note && <p className={`mentor-surface__note mentor-surface__note--${note.kind}`} role={note.kind === 'error' ? 'alert' : 'status'}>{note.text}</p>}

            {/* Generate: shown as soon as there is a setup, so what is still missing is said, not hidden. */}
            {!turning && hasPreview && !generated && !editingId && (
                <div className="portfolio-panel__action-bubble mentor-panel__generate">
                    <button
                        className="portfolio-panel__review-btn portfolio-panel__review-btn--update mentor-panel__btn"
                        onClick={() => commit('generate')}
                        disabled={!live.ready || pressing}
                    >
                        {pressing ? 'Generating…' : 'Generate setup'}
                    </button>
                    {names.length > 1 && (
                        <button
                            className="portfolio-panel__review-btn mentor-panel__btn mentor-panel__btn--all"
                            onClick={() => commit('generateAll', (r) => batchReport(r))}
                            disabled={pressing || accounts.length === 0}
                            title={names.join(' · ')}
                        >
                            {pressing ? 'Generating…' : `Generate all (${names.length})`}
                        </button>
                    )}
                    {!live.ready && missing.length > 0 && (
                        <span className="mentor-panel__missing">Still needs: {missing.map(b => b.text).join(', ')}</span>
                    )}
                    {!live.ready && problems.map((b, i) => <span className="mentor-panel__problem" key={i}>Doesn’t add up: {b.text}</span>)}
                    {/* Warnings are never blockers — they show whether or not Generate is lit. */}
                    {live.warnings.length > 0 && <span className="mentor-panel__warning">{live.warnings.join(' · ')}</span>}
                    {!live.ready && live.blockers.length === 0 && (
                        <span className="mentor-panel__missing">Not ready yet — ask Mentor what’s outstanding.</span>
                    )}
                    {live.ready && <span className="mentor-panel__missing">Generates as <em>waiting</em> — arm it to start monitoring.</span>}
                </div>
            )}

            {/* Generated but not armed: the setup exists and nothing watches it — the one moment that must be unmissable. */}
            {!turning && generated && (
                <div className="portfolio-panel__action-bubble mentor-panel__armed">
                    <p className="mentor-panel__armed-copy">
                        <strong>{generated.asset}</strong> saved as <em>waiting</em> — nothing is watching it yet.
                    </p>
                    <button
                        className="portfolio-panel__review-btn portfolio-panel__review-btn--update mentor-panel__btn"
                        onClick={() => commit('arm', () => `${generated.asset} is armed — Talos is watching it.`)}
                        disabled={pressing}
                    >
                        {pressing ? 'Arming…' : 'Arm it — start monitoring'}
                    </button>
                    <button
                        className="portfolio-panel__review-btn portfolio-panel__review-btn--later mentor-panel__btn"
                        onClick={() => commit('leave', () => `${generated.asset} is saved, waiting — arm it from the lists when you are ready.`)}
                        disabled={pressing}
                    >
                        Leave it waiting
                    </button>
                </div>
            )}

            {!turning && editingId && (
                <div className="portfolio-panel__action-bubble">
                    {dirty ? (
                        <button
                            className="portfolio-panel__review-btn portfolio-panel__review-btn--update mentor-panel__btn"
                            onClick={() => commit('update', (r) => `${r.setup?.asset ?? 'The setup'} is updated.`)}
                            disabled={!live.ready || pressing}
                        >
                            {accounts.length === 0 ? 'Mark an account to update' : 'Update setup'}
                        </button>
                    ) : (
                        <span className="mentor-panel__missing">Tell Mentor what to change — “Update setup” appears once the plan moves.</span>
                    )}
                    <LaterButton className={`${LATER_BTN_CLASS} mentor-panel__btn`} onClick={() => commit('later')} />
                </div>
            )}
        </div>
    )
}

MentorSurface.propTypes = {
    session:   PropTypes.shape({
        agentState: PropTypes.object,
        live:       PropTypes.object,
        send:       PropTypes.func.isRequired,
        commit:     PropTypes.func.isRequired,
        edit:       PropTypes.func.isRequired,
    }).isRequired,
    deskProps: PropTypes.shape({
        availableAccounts:   PropTypes.array,
        selectedAccounts:    PropTypes.array,
        setSelectedAccounts: PropTypes.func,
        mainAccountId:       PropTypes.string,
        setMainAccountId:    PropTypes.func,
    }),
}
