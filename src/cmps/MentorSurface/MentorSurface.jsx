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
import { useSurfacePress } from '../../customHooks/useSurfacePress.js'
import { SurfaceNote } from '../SidePane/SurfaceNote.jsx'
import { DiscardButton } from '../SidePane/DiscardButton.jsx'
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

/** Each refused plan with its reason — a Generate-all's partial news and an all-refused press say it the same way. */
const refusals = (failed) => failed.map(f => `${f.asset ?? `#${f.index + 1}`} — ${f.reason}`).join('; ')

/** A Generate-all's news: what was saved, and each plan refused with its reason (partial success is the contract). */
function batchReport(result) {
    const saved = result?.setups?.length ?? 0
    const failed = result?.failed ?? []
    return failed.length ? `${saved} saved. ${failed.length} not: ${refusals(failed)}` : `${saved} saved.`
}

// A hand edit is sent after the typing stops, one at a time: a PATCH per keystroke would race its own revisions.
const EDIT_SETTLE_MS = 600

/**
 * The worksheet's hand edits: a local copy while the user types, sent once they pause, one PATCH in flight. A server
 * draft that moves while nothing is pending (a turn landed) replaces the local copy; one that moved while an edit was
 * out is put back once it settles (the server's re-judged copy wins).
 *
 * Each edit names the revision it was MADE against (`base`): the server's when the typing started, then the one each
 * accepted edit left. Never the revision current at send time — that would overwrite a turn the user never saw
 * (phase 8b CR). `push(draft, rev)` answers the outcome; a refusal ends the run and the caller resets.
 *
 * `settle()` sends what is waiting and resolves once nothing is out — true when every edit went through. A press
 * awaits it first, so it never commits the plan as it stood before the last keystrokes.
 */
function useDraftEditor(serverDraft, serverRev, push) {
    const [local, setLocal] = useState(serverDraft)
    const pending = useRef(null)
    const inFlight = useRef(null)      // the promise of the edit out now
    const timer = useRef(null)
    const base = useRef(null)          // the revision the waiting edit was made against
    const behind = useRef(false)       // the server's draft moved while an edit was waiting or out
    const fails = useRef(0)            // refused edits so far — settle() compares across its wait
    // Read at send time: an account marked inside the settle window rides the edit (the closure would hold the old).
    const pushRef = useRef(push)
    pushRef.current = push
    const server = useRef({ draft: serverDraft, rev: serverRev })
    server.current = { draft: serverDraft, rev: serverRev }

    useEffect(() => {
        if (!pending.current && !inFlight.current) setLocal(serverDraft)
        else behind.current = true
    }, [serverDraft])

    const flush = useCallback(() => {
        clearTimeout(timer.current)
        timer.current = null
        if (inFlight.current) return inFlight.current.then(() => flush())
        if (!pending.current) {
            base.current = null
            if (behind.current) { behind.current = false; setLocal(server.current.draft) }
            return Promise.resolve()
        }
        const next = pending.current
        pending.current = null
        inFlight.current = (async () => {
            try {
                const out = await pushRef.current(next, base.current)
                if (out?.ok) base.current = Number.isInteger(out.rev) ? out.rev : null
                else { fails.current += 1; pending.current = null }
            } catch {
                fails.current += 1
                pending.current = null
            } finally {
                inFlight.current = null
            }
        })()
        return inFlight.current.then(() => flush())
    }, [])

    // Closing the pane, a tab switch or Esc inside the settle window sends the edit rather than dropping it.
    useEffect(() => () => { if (pending.current) flush() }, [flush])

    const change = useCallback((next) => {
        if (!pending.current && !inFlight.current && base.current === null) base.current = server.current.rev
        setLocal(next)
        pending.current = next
        clearTimeout(timer.current)
        timer.current = setTimeout(flush, EDIT_SETTLE_MS)
    }, [flush])

    /** Drop what was typed and stand on the server's draft again (a refused edit). */
    const reset = useCallback(() => {
        pending.current = null
        clearTimeout(timer.current)
        base.current = null
        behind.current = false
        setLocal(server.current.draft)
    }, [])

    const settle = useCallback(() => {
        const before = fails.current
        return flush().then(() => fails.current === before)
    }, [flush])

    return { draft: local, change, reset, settle }
}

export function MentorSurface({ session, deskProps = {} }) {
    const { availableAccounts = [], selectedAccounts = [], setSelectedAccounts, setMainAccountId } = deskProps
    // The press mechanics every surface shares: the marked accounts, the note, one press at a time, the stale refusal.
    const { accounts, mainAccountId, rev, pressing, note, setNote, talk: say, press: commitPress } = useSurfacePress(session, 'mentor', deskProps, { brand: 'Mentor' })
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

    const [previewOpen, setPreviewOpen] = useState(false)

    // A refused edit puts the server's draft back — read through a ref, the editor is made with this callback.
    const resetEdit = useRef(null)
    const pushEdit = useCallback(async (draft, madeAt) => {
        const out = await session.edit('mentor', { draft, accounts }, { rev: madeAt })
        if (!out.ok) {
            setNote(out.reason === 'stale_state'
                ? { kind: 'error', sticky: true, text: 'Mentor moved on while you were typing — your edit was not saved.' }
                : { kind: 'error', text: out.message })
            resetEdit.current?.()
        }
        return out
    }, [session, accounts, setNote])
    const editor = useDraftEditor(serverDraft, rev, pushEdit)
    resetEdit.current = editor.reset
    const draft = editor.draft

    // "Change something" on the opening card: the card steps aside so the user can say it — until Mentor puts a new
    // proposal up (a different gate), which is shown again.
    const [setAside, setSetAside] = useState(null)
    const gateKey = gate ? JSON.stringify(gate) : null

    // UPDATE ONLY ONCE THE PLAN MOVED. An update re-runs the venue gate and sends a watched setup back to `waiting`,
    // so pressing it on an unchanged plan would stop Talos watching for nothing. The baseline is the plan as it
    // reopened, held per setup. Read off the SERVER's draft, not the local copy: Update lights once the edit has
    // landed, never while the keystrokes are still on their way (phase 8b CR).
    const baseline = useRef({ id: null, json: null })
    if (editingId && baseline.current.id !== editingId && serverDraft) baseline.current = { id: editingId, json: JSON.stringify(serverDraft) }
    if (!editingId && baseline.current.id) baseline.current = { id: null, json: null }
    const dirty = !!editingId && JSON.stringify(serverDraft) !== baseline.current.json

    const talk = (text, ops = []) => say(text, ops.length ? { ops } : {})
    const press = (p) => { if (p) talk(p.text, p.ops) }

    // The hand edit still settling goes first — the server commits what IS in the session. A refused edit has said so
    // (its note) and the press stops: the plan on screen is not the one it would commit.
    const commit = (action, done) => commitPress(action, {
        before:  () => editor.settle(),
        done:    done ? (result) => done(result) : undefined,
        refused: (out) => (out.extra?.failed?.length ? `Nothing was saved: ${refusals(out.extra.failed)}` : null),
    })

    const live = liveReadiness(readiness, accounts.length)
    const names = batchNames(draft, drafts)
    const hasPreview = !!draft?.asset
    const missing = live.blockers.filter(b => b.kind === 'missing')
    const problems = live.blockers.filter(b => b.kind === 'problem')
    // Why Update is dark while editing — the bar is always on screen, so it says so rather than leaving a dead button.
    const editHint = !editingId ? null
        : turning ? 'Mentor is answering…'
        : !dirty ? 'Tell Mentor what to change — Update lights once the plan moves.'
        : !live.ready ? (missing.length ? `Still needs: ${missing.map(b => b.text).join(', ')}` : 'Not ready yet — ask Mentor what’s outstanding.')
        : null

    // Which account the setup trades in. On the empty table too (Roy, 2026-10-19 — "the account icon is gone"): the start
    // of a trade is when it is chosen, and Mentor sizes against it from the first turn.
    const accountsPick = setSelectedAccounts && (
        <div className="mentor-surface__accounts">
            <AccountSelector
                accounts={availableAccounts}
                selectedIds={selectedAccounts}
                onChange={setSelectedAccounts}
                mainAccountId={mainAccountId}
                onMainChange={setMainAccountId}
            />
        </div>
    )

    // ── Nothing on the table ──
    if (!state || (!draft && !generated && !candidates?.length && !coverage.length)) {
        return (
            <div className="desk-surface mentor-surface">
                {accountsPick}
                {note?.kind === 'done' && <SurfaceNote note={note} />}
                <p className="desk-surface__lead">Nothing on Mentor&apos;s table. Tell Mentor about a trade in the chat, or start here:</p>
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
        <div className="portfolio-panel mentor-panel desk-surface mentor-surface">
            {accountsPick}

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

            <SurfaceNote note={note} />

            {/* Generate: shown as soon as there is a setup, so what is still missing is said, not hidden. */}
            {!turning && hasPreview && !generated && !editingId && (
                <div className="portfolio-panel__action-bubble mentor-panel__generate desk-surface__bar">
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
                    <DiscardButton what={names.length > 1 ? 'these plans' : `the ${draft?.asset ?? ''} plan`} onDiscard={() => commitPress('discard', { before: async () => { editor.reset(); await editor.settle(); return true }, done: () => 'Discarded — Mentor\'s table is clear.' })} disabled={pressing} />
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

            {/* EDITING: the bar is always there, pinned to the pane's bottom (Roy, 2026-10-18) — Update lit only once the
                plan has moved and is whole, both dark while Mentor is answering; the line under them says why. */}
            {editingId && (
                <div className="portfolio-panel__action-bubble desk-surface__bar">
                    <button
                        className="portfolio-panel__review-btn portfolio-panel__review-btn--update mentor-panel__btn"
                        onClick={() => commit('update', (r) => `${r.setup?.asset ?? 'The setup'} is updated.`)}
                        disabled={turning || pressing || !dirty || !live.ready || accounts.length === 0}
                    >
                        {pressing ? 'Updating…' : accounts.length === 0 ? 'Mark an account to update' : 'Update setup'}
                    </button>
                    <LaterButton className={`${LATER_BTN_CLASS} mentor-panel__btn`} onClick={() => commit('later')} disabled={turning || pressing} />
                    {editHint && <span className="mentor-panel__missing">{editHint}</span>}
                </div>
            )}
        </div>
    )
}

// What this pane is, said once under its tabs (SidePane — Roy, 2026-10-19: the pane was not clear to a user).
MentorSurface.paneHint = 'Your setup, as you build it with Mentor. It fills in while you talk; when it’s ready, the button at the bottom saves it.'

MentorSurface.propTypes = {
    session:   PropTypes.shape({
        agentState: PropTypes.object,
        live:       PropTypes.object,
        agentRev:   PropTypes.object,
        send:       PropTypes.func.isRequired,
        commit:     PropTypes.func.isRequired,
        edit:       PropTypes.func.isRequired,
    }).isRequired,
    deskProps: PropTypes.shape({
        availableAccounts:   PropTypes.array,
        selectedAccounts:    PropTypes.array,
        accounts:            PropTypes.array,
        setSelectedAccounts: PropTypes.func,
        mainAccountId:       PropTypes.string,
        setMainAccountId:    PropTypes.func,
    }),
}
