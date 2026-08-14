import { useState, useRef, useEffect } from 'react'
import PropTypes from 'prop-types'
import { analystService } from '../../services/analyst/analyst.service.remote.js'
import { threadsService, newThreadId, clearThread } from '../../services/threads/threads.service.remote.js'
import { readStoredModel } from '../modelOptions.js'
import { useChatStream, toChatHistory } from '../../customHooks/useChatStream.js'
import { useSeedTurn } from '../../customHooks/useSeedTurn.js'
import { AgentMessages } from '../AgentMessages.jsx'
import { AgentChatInput } from '../AgentChatInput.jsx'
import { ChatBubble } from '../ChatBubble.jsx'
import { PriceTarget } from '../PriceTarget/PriceTarget.jsx'
import { ToolStatusChip } from '../ToolStatusChip/ToolStatusChip.jsx'
import { waitingLabel } from '../ToolStatusChip/waitingLabel.js'
import { resolveArtifact } from '../../services/pipeline/artifact.js'
import '../PortfolioPanel/PortfolioPanel.scss'
import './AnalystPanel.scss'

const ANALYST_PHASE_LABELS = { 1: 'Profile', 2: 'The Street', 3: 'Our view', 4: 'Valuation', 5: 'The call', 6: 'Coverage' }

const MessageBubble = ({ msg }) => (
    <ChatBubble msg={msg} phaseLabels={ANALYST_PHASE_LABELS} phaseTotal={6} />
)
MessageBubble.propTypes = { msg: PropTypes.object.isRequired }

// The drafted coverage preview — the variant-perception thesis, our PT vs the Street (the gap = the
// edge), the rating, and the monitorable kill-criteria. Shown before "Initiate coverage".
export function CoverageDraft({ coverage }) {
    const pt  = coverage.price_target
    const gap = coverage.gap
    const kills = Array.isArray(coverage.kill_criteria) ? coverage.kill_criteria : []
    return (
        <div className="analyst-panel__draft">
            <div className="analyst-panel__draft-head">
                <span className="analyst-panel__asset">{coverage.symbol}</span>
                {coverage.rating && <span className={`analyst-panel__rating analyst-panel__rating--${coverage.rating}`}>{coverage.rating.replace('_', ' ')}</span>}
                <PriceTarget priceTarget={pt} gap={gap} gapSource />
            </div>
            {coverage.thesis && <div className="analyst-panel__thesis">{coverage.thesis}</div>}
            {kills.length > 0 && (
                <div className="analyst-panel__kills">
                    <span className="analyst-panel__kills-label">kill-criteria</span>
                    <ul>{kills.map((k, i) => <li key={i}>{typeof k === 'string' ? k : JSON.stringify(k)}</li>)}</ul>
                </div>
            )}
        </div>
    )
}
CoverageDraft.propTypes = { coverage: PropTypes.object.isRequired }

export function AnalystPanel({ inbox = null, editCoverage = null, seed = null, onLoadingChange, onInitiated, onSleeveResearched, coverage = [], pipeline = null, resumeRef = null }) {
    const chat = useChatStream({ threadPhases: true })
    const { messages, isLoading } = chat
    const [pendingCoverage, setPendingCoverage] = useState(null)
    const [initiateErr, setInitiateErr] = useState('')
    // The rest of a handed-over sleeve, and what has been covered so far in this run. `done` is what
    // gets handed back to Atlas — the names it can actually construct from.
    const [queue, setQueue] = useState([])
    const [done,  setDone]  = useState([])
    // Whether this run came from a sleeve hand-off at all. Distinct from `queue.length`: on the LAST
    // name the queue is already empty, and keying off that sent the user home to Axl a click before
    // the hand-back to Atlas could be offered.
    const [sleeveRun, setSleeveRun] = useState(false)
    const seedRef     = useRef(null)   // one-shot Argus investing seed for the next send
    const pendingRef  = useRef(null)
    pendingRef.current = pendingCoverage
    const threadIdRef = useRef(newThreadId())   // the research conversation's draft thread

    // Existing coverage for the pending symbol — drives "Update vs Initiate" mode.
    // Match any status: the backend blocks initiation for retired coverage too, so we must update it.
    const existingCoverage = pendingCoverage
        ? (coverage || []).find(c => c.symbol === pendingCoverage.symbol) ?? null
        : null
    const existingRef = useRef(null)
    existingRef.current = existingCoverage

    useEffect(() => { onLoadingChange?.(isLoading) }, [isLoading])   // eslint-disable-line react-hooks/exhaustive-deps

    /**
     * Persist the research conversation as a DRAFT THREAD (the shared mechanism — same call Mentor,
     * Kairos, Scanner and Portfolio make; the backend enforces the substantive floor, the TTL and the
     * LRU cap). Without it this desk had no persistence at all: the marker read nothing, the lock
     * closed nothing, and the resume the user saw was React state surviving behind a `display:none`
     * tab — gone on the next reload.
     *
     * `pipeline` is the DESK, and it is what makes the marker land on ONE route rather than on every
     * desk that happens to enter at Prometheus (see AxlHub/deskWork).
     *
     * The EDIT run saves here too, unlike Kairos/Mentor, which write their chat back onto the artifact
     * they are editing. Coverage has no chat-state field to write to, and inventing one to mirror the
     * shape would persist the same conversation twice. The link on save is what ties it to the thesis.
     */
    // `draft` is passed IN rather than read off the ref: setPendingCoverage lands after this turn's
    // onDone runs, so the ref still holds the PREVIOUS draft right here — the same reason Kairos
    // threads `nextCall` through instead of reading its state.
    function _saveThread(msgs, phase, draft) {
        threadsService.saveDraft({
            pipeline,
            threadId: threadIdRef.current, agent: 'analyst',
            messages: msgs, phase: phase ?? null, subjectType: 'coverage',
            state: draft ? { draft } : null,
        })
    }

    async function _send(text) {
        if (!text || isLoading) return
        setInitiateErr('')
        const candidate = seedRef.current; seedRef.current = null   // NB: the Argus payload, not the `seed` prop
        const history = toChatHistory(messages)
        history.push({ role: 'user', content: text })

        const { signal, handlers } = chat.begin(text, {
            onDone: (data) => {
                chat.finishStreaming({ role: 'assistant' })   // keep the phase-threaded bubbles
                if (data.coverage) setPendingCoverage(data.coverage)
                _saveThread([...history, { role: 'assistant', content: data.reply }], data.phase, data.coverage ?? pendingRef.current)
            },
        })

        try {
            await analystService.sendStream(history, {
                model:           readStoredModel(),
                // Feed the draft-so-far back so the model carries settled fields forward.
                chatState:       { active_symbol: pendingRef.current?.symbol || candidate?.ticker || '', draft: pendingRef.current, existing_coverage: existingRef.current },
                seed: candidate, // structured Argus investing candidate (one-shot on the hand-off turn)
                signal,
                ...handlers,
            })
        } catch (err) {
            console.error('[analyst]', err)
            chat.freezeError()
        } finally {
            chat.endStream()
        }
    }

    // Resume a stopped reply (▶): continue the same bubble (or regenerate if stopped before any token).
    async function _continue() {
        if (isLoading) return
        const last = messages[messages.length - 1]
        if (!last || last.role !== 'assistant' || !last.stopped) return
        const base = chat.resumeBase()
        const history = chat.finalizeResumeHistory(
            toChatHistory(messages),
            base,
        )
        const cont = chat.beginContinue({
            onError: () => chat.restoreStopped(base),
            onDone: (data) => {
                chat.finishStreaming({ role: 'assistant', content: base + data.reply })
                if (data.coverage) setPendingCoverage(data.coverage)
                _saveThread([...history.slice(0, -1), { role: 'assistant', content: base + data.reply }], data.phase, data.coverage ?? pendingRef.current)
            },
        })
        if (!cont) return
        try {
            await analystService.sendStream(history, {
                model:           readStoredModel(),
                chatState:       { active_symbol: pendingRef.current?.symbol || '', draft: pendingRef.current, existing_coverage: existingRef.current },
                signal:          cont.signal,
                ...cont.handlers,
            })
        } catch (err) {
            console.error('[analyst]', err)
            chat.restoreStopped(base)
        } finally {
            chat.endStream()
        }
    }

    // Argus investing candidate(s) handed over → seed the research (fires once per keyed result).
    //
    // A sleeve arrives as a QUEUE, not one name: Argus ranks 4-8 candidates and the pipeline wants
    // the top of that list researched before Atlas can construct anything. Each name is still its own
    // cycle — research turn, draft, the user presses Initiate — because coverage is only ever saved on
    // an explicit confirm. What the queue removes is the walk back to the list between names.
    useEffect(() => {
        const names = resolveArtifact(inbox).items.map(c => c?.ticker).filter(Boolean)
        if (!names.length) return
        setQueue(names.slice(1))
        setDone([])
        // A run is what the SENDER said it was, not what its length happens to be: a sleeve whose
        // top slice came back with one name is still a run, and a single candidate the user clicked
        // is not. Inferring it from `names.length > 1` would get both of those wrong.
        setSleeveRun(inbox?.context?.queued === true)
        _sendResearch(names[0], names.slice(1))
    }, [inbox?.key])   // eslint-disable-line react-hooks/exhaustive-deps

    // One name's research turn. The rest of the run rides along in the text so Prometheus can pace
    // itself and the user can see where they are — and `pool` carries the names NOT in the top slice,
    // so "do KLAC as well" is a thing they can just ask for.
    function _sendResearch(ticker, rest) {
        const { bySector = [], sector = null, pool: allNames = [] } = inbox?.context ?? {}
        // Which sleeve this name is FOR. A run spans several sectors, and researching a utility with
        // the tech sleeve's frame in mind produces a thesis for the wrong book.
        const sleeve = bySector.find(s => s.names?.includes(ticker))?.sector ?? sector
        // Argus's read on THIS name, off the item rather than the envelope: a list carries one per
        // candidate, and a single hand-off carries one for the only candidate there is.
        const cand = resolveArtifact(inbox).items.find(c => c?.ticker === ticker) ?? {}
        seedRef.current = { ticker, sector: sleeve, thesis: cand.thesis ?? null, analysis: cand.analysis ?? null }
        const pool = allNames.filter(t => t !== ticker && !rest.includes(t))
        const lines = [`Research ${ticker} for coverage${sleeve ? ` — it is a candidate for the ${sleeve} sleeve` : ''}.`]
        if (rest.length)  lines.push(`This is one of ${rest.length + 1} from the same sleeve — ${rest.join(', ')} follow after it. Do ${ticker} only for now.`)
        if (pool.length)  lines.push(`Also on the list but not queued: ${pool.join(', ')}. Only research one of those if the user asks.`)
        _send(lines.join(' '))
    }

    // Axl routed the user here with the name already resolved (MainPage's handleAxlPick) → open on
    // it. The bare-ticker cousin of the Argus hand-off above: no scan behind it, so no `seed` for
    // the backend — just the turn that starts the research.
    useSeedTurn(seed, _send)

    // The coverage pencil → re-open Prometheus on a name already in the book. Setting
    // pendingCoverage to the live doc is what puts the panel in UPDATE mode: `existingCoverage`
    // matches on symbol, the stream carries `existing_coverage`, and Save becomes a `remodel`
    // revision on the same doc rather than a fresh initiation. A NEW chat each time (reset first) —
    // the prior conversation belonged to whatever was last researched here, not to this thesis.
    useEffect(() => {
        if (!editCoverage?.symbol) return
        const doc = (coverage || []).find(c => c.symbol === editCoverage.symbol)
        if (!doc) return
        chat.reset()
        setInitiateErr('')
        setPendingCoverage(doc)
        // BOTH refs, and for the same reason: `_send` runs before React re-renders, so anything derived
        // from `pendingCoverage` during render — `existingCoverage` included — is still null right here.
        // Without this line the revise turn shipped `existing_coverage: null`, and the agent opened on
        // a blank slate: the prompt's "this name is already in the book, revise it" block never
        // rendered, on the one turn whose entire purpose is revising what is in the book.
        pendingRef.current  = doc
        existingRef.current = doc
        _send(`Revise our coverage on ${doc.symbol}. What has changed since the last view, and does the thesis still hold?`)
    }, [editCoverage?.key])   // eslint-disable-line react-hooks/exhaustive-deps

    // Clear is not walking away — the draft goes with the conversation, or the hub keeps marking this
    // desk and holding Prometheus's other doors shut over research the user threw away. See clearThread.
    function handleClear()     { chat.reset(); setPendingCoverage(null); setInitiateErr(''); clearThread(threadIdRef) }

    // Resume an unfinished research draft: restore the conversation and its pending thesis, and keep
    // writing to the SAME thread. `existing_coverage` is not restored here — it is derived from the
    // draft's symbol against the live book on the next render, so a resumed edit run picks up whatever
    // the thesis says NOW rather than a copy frozen when the user walked out.
    async function handleResumeThread(threadId) {
        const t = await threadsService.getThread(threadId)
        if (!t) return
        chat.setMessages(t.messages ?? [])
        setPendingCoverage(t.state?.draft ?? null)
        setInitiateErr('')
        threadIdRef.current = t.threadId
    }
    // Expose resume to the shared agent-bar hamburger (MainPage).
    if (resumeRef) resumeRef.current = handleResumeThread

    /**
     * The thesis exists → the conversation that authored it belongs WITH it, not in the draft pile.
     * Linking clears the TTL and takes the thread off the desk marker; the next research run starts on
     * a fresh id.
     *
     * AWAITED, and before `onInitiated` — that callback ends the desk run, and finishing a run deletes
     * its remaining DRAFTS. Fire-and-forget here would race the delete and could drop the reasoning
     * behind a thesis the user just saved, silently (a link matching nothing is not an error).
     *
     * Linked on an UPDATE as well as an initiation: a re-model is the conversation behind the thesis
     * as it now stands, and leaving it a draft would keep marking a desk the user is finished with.
     */
    async function _linkThread(saved) {
        if (!saved?.id) return
        await threadsService.linkThread(threadIdRef.current, { subjectType: 'coverage', subjectId: saved.id, artifactName: saved.symbol ?? null })
        threadIdRef.current = newThreadId()
    }

    // Coverage saved → move the sleeve on. Only the SAVED names count as researched: a draft the
    // user declined is not something Atlas should build on.
    function _advance(saved) {
        const covered = [...done, saved?.symbol].filter(Boolean)
        setDone(covered)
        const [next, ...rest] = queue
        if (!next) return
        setQueue(rest)
        _sendResearch(next, rest)
    }

    async function handleInitiate() {
        if (!pendingCoverage) return
        setInitiateErr('')
        try {
            let saved
            if (existingCoverage) {
                saved = await analystService.updateCoverage(existingCoverage.id, {
                    ...pendingCoverage,
                    revision_kind: 'remodel',
                    revision_note: `Coverage updated via Prometheus`,
                })
            } else {
                saved = await analystService.initiateCoverage(pendingCoverage)
            }
            setPendingCoverage(null)
            await _linkThread(saved)
            onInitiated?.(saved, { sleeve: sleeveRun })
            _advance(saved)
        } catch (err) {
            // 409 fallback: backend blocked initiation because coverage exists but wasn't in our
            // client-side list (stale load, retired status missed). Use the id from the error to update.
            //
            // The code rides on `reason`; `error` is the human sentence (sendReason sends both). This
            // used to test `error === 'already_covered'`, which no response has ever matched — so the
            // fallback never ran and a stale list surfaced as a flat "Could not initiate coverage."
            const errData = err?.response?.data
            const reason  = errData?.reason ?? errData?.error
            if (!existingCoverage && reason === 'already_covered' && errData?.id) {
                try {
                    const saved = await analystService.updateCoverage(errData.id, {
                        ...pendingCoverage,
                        revision_kind: 'remodel',
                        revision_note: 'Coverage updated via Prometheus',
                    })
                    setPendingCoverage(null)
                    await _linkThread(saved)
                    onInitiated?.(saved, { sleeve: sleeveRun })
                    _advance(saved)
                } catch {
                    setInitiateErr('Could not update coverage.')
                }
                return
            }
            // A refusal the analyst can ACT on (the rating contradicts the target) explains itself —
            // the backend's `detail` names which way it breaks. A flat "could not initiate" would send
            // the user back to a thesis with nothing to fix.
            setInitiateErr(errData?.detail
                ? `${errData.error ?? 'Coverage refused'} — ${errData.detail}`
                : `Could not ${existingCoverage ? 'update' : 'initiate'} coverage.`)
        }
    }

    return (
        <div className="portfolio-panel analyst-panel">
            <AgentMessages chat={chat}>
                {messages.length === 0 && (
                    <div className="analyst-panel__intro">
                        <h3>Prometheus</h3>
                        <p>Buy-side research — a living thesis per name: a variant view, our price target vs the Street, and monitorable kill-criteria. Name a ticker (or open one from an Argus investing list).</p>
                    </div>
                )}
                {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
                {isLoading && <ToolStatusChip label={waitingLabel({ messages, streamStatus: chat.streamStatus, placeholder: 'researching…' })} pulse={chat.reasoningPulse} />}
            </AgentMessages>

            {!isLoading && pendingCoverage && (
                <div className="analyst-panel__draft-wrap">
                    <CoverageDraft coverage={pendingCoverage} />
                    {initiateErr && <div className="analyst-panel__err">{initiateErr}</div>}
                    <button className="portfolio-panel__review-btn portfolio-panel__review-btn--update" onClick={handleInitiate}>
                        {existingCoverage ? `Update coverage on ${pendingCoverage.symbol}` : `Initiate coverage on ${pendingCoverage.symbol}`}
                    </button>
                </div>
            )}

            {/* The sleeve is researched — hand it back. Without this the pipeline dead-ends here:
                Atlas reads coverage itself, but nothing was returning the user to it. Shown while
                the queue is empty and at least one name got saved, so a declined draft doesn't
                pretend to be research. */}
            {!isLoading && !pendingCoverage && sleeveRun && !queue.length && done.length > 0 && (
                <div className="portfolio-panel__action-bubble">
                    <button
                        className="portfolio-panel__review-btn portfolio-panel__review-btn--update"
                        onClick={() => onSleeveResearched?.(done)}
                    >
                        Back to Atlas — {done.length} researched →
                    </button>
                    <span className="analyst-panel__ask-hint">
                        {done.join(', ')} {done.length === 1 ? 'is' : 'are'} in coverage. Atlas builds the sleeve from there.
                    </span>
                </div>
            )}

            <AgentChatInput
                chat={chat}
                placeholder="A ticker to research — e.g. “Cover NVDA” (Enter to send)"
                onSend={_send}
                onClear={handleClear}
                onResume={_continue}
            />
        </div>
    )
}
AnalystPanel.propTypes = {
    inbox:           PropTypes.object,   // a pipeline artifact (candidate_list)
    editCoverage:    PropTypes.object,
    seed:            PropTypes.object,
    onLoadingChange: PropTypes.func,
    onInitiated:     PropTypes.func,
    onSleeveResearched: PropTypes.func,
    coverage:        PropTypes.array,
    pipeline:        PropTypes.string,   // the DESK this run belongs to — what the marker keys on
    resumeRef:       PropTypes.object,
}
