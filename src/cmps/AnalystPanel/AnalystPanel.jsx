import { useState, useRef, useEffect } from 'react'
import PropTypes from 'prop-types'
import { analystService } from '../../services/analyst/analyst.service.remote.js'
import { readStoredModel } from '../modelOptions.js'
import { readStoredReasoning } from '../reasoningOptions.js'
import { useChatStream, toChatHistory } from '../../customHooks/useChatStream.js'
import { useSeedTurn } from '../../customHooks/useSeedTurn.js'
import { AgentMessages } from '../AgentMessages.jsx'
import { AgentChatInput } from '../AgentChatInput.jsx'
import { ChatBubble } from '../ChatBubble.jsx'
import { ToolStatusChip } from '../ToolStatusChip/ToolStatusChip.jsx'
import { waitingLabel } from '../ToolStatusChip/waitingLabel.js'
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
                {pt?.value != null && (
                    <span className="analyst-panel__pt">
                        PT {pt.value}
                        {gap?.pct != null && <span className={`analyst-panel__gap analyst-panel__gap--${gap.pct >= 0 ? 'up' : 'down'}`}> {gap.pct >= 0 ? '+' : ''}{gap.pct}% vs Street</span>}
                    </span>
                )}
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

export function AnalystPanel({ scanResult = null, editCoverage = null, seed = null, onLoadingChange, onInitiated, onSleeveResearched, coverage = [] }) {
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

    // Existing coverage for the pending symbol — drives "Update vs Initiate" mode.
    // Match any status: the backend blocks initiation for retired coverage too, so we must update it.
    const existingCoverage = pendingCoverage
        ? (coverage || []).find(c => c.symbol === pendingCoverage.symbol) ?? null
        : null
    const existingRef = useRef(null)
    existingRef.current = existingCoverage

    useEffect(() => { onLoadingChange?.(isLoading) }, [isLoading])   // eslint-disable-line react-hooks/exhaustive-deps

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
            },
        })

        try {
            await analystService.sendStream(history, {
                model:           readStoredModel('analystModel'),
                reasoningEffort: readStoredReasoning('analystReasoning'),
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
            },
        })
        if (!cont) return
        try {
            await analystService.sendStream(history, {
                model:           readStoredModel('analystModel'),
                reasoningEffort: readStoredReasoning('analystReasoning'),
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
        const names = scanResult?.queue?.length ? scanResult.queue : (scanResult?.ticker ? [scanResult.ticker] : [])
        if (!names.length) return
        setQueue(names.slice(1))
        setDone([])
        setSleeveRun(!!scanResult?.queue?.length)
        _sendResearch(names[0], names.slice(1))
    }, [scanResult?.key])   // eslint-disable-line react-hooks/exhaustive-deps

    // One name's research turn. The rest of the run rides along in the text so Prometheus can pace
    // itself and the user can see where they are — and `pool` carries the names NOT in the top slice,
    // so "do KLAC as well" is a thing they can just ask for.
    function _sendResearch(ticker, rest) {
        seedRef.current = { ticker, sector: scanResult?.sector ?? null, thesis: scanResult?.thesis ?? null, analysis: scanResult?.analysis ?? null }
        const pool = (scanResult?.pool ?? []).filter(t => t !== ticker && !rest.includes(t))
        const lines = [`Research ${ticker} for coverage.`]
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
        pendingRef.current = doc
        _send(`Revise our coverage on ${doc.symbol}. What has changed since the last view, and does the thesis still hold?`)
    }, [editCoverage?.key])   // eslint-disable-line react-hooks/exhaustive-deps

    function handleClear()     { chat.reset(); setPendingCoverage(null); setInitiateErr('') }

    // A finished research turn with NO draft. Three things look identical from here: Prometheus
    // PASSED on purpose (no edge — an honest answer the prompt asks for), the block never closed
    // (a long reply cut short takes `</coverage>` with it), or its JSON didn't parse. In all three
    // the user is left reading a full write-up with nothing to press, and the only escape was to
    // guess the right sentence to type. So the ask lives at the foot of the conversation the way
    // Mentor's Generate does — always there once a turn has answered, and it says what it will do.
    const hasReply = messages.some(m => m.role === 'assistant' && m.content)
    const askForDraft = () => _send(
        'Write the coverage up now — emit the coverage block with everything you settled on. ' +
        "If you're passing on this name, say so in one line instead."
    )

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
            onInitiated?.(saved, { sleeve: sleeveRun })
            _advance(saved)
        } catch (err) {
            // 409 fallback: backend blocked initiation because coverage exists but wasn't in our
            // client-side list (stale load, retired status missed). Use the id from the error to update.
            const errData = err?.response?.data
            if (!existingCoverage && errData?.error === 'already_covered' && errData?.id) {
                try {
                    const saved = await analystService.updateCoverage(errData.id, {
                        ...pendingCoverage,
                        revision_kind: 'remodel',
                        revision_note: 'Coverage updated via Prometheus',
                    })
                    setPendingCoverage(null)
                    onInitiated?.(saved, { sleeve: sleeveRun })
                    _advance(saved)
                } catch {
                    setInitiateErr('Could not update coverage.')
                }
                return
            }
            setInitiateErr(`Could not ${existingCoverage ? 'update' : 'initiate'} coverage.`)
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

            {!isLoading && !pendingCoverage && hasReply && (
                <div className="portfolio-panel__action-bubble analyst-panel__ask">
                    <button className="portfolio-panel__review-btn portfolio-panel__review-btn--update" onClick={askForDraft}>
                        Draft coverage
                    </button>
                    <span className="analyst-panel__ask-hint">
                        No draft yet — Prometheus writes one only when it has a view.
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
    scanResult:      PropTypes.object,
    editCoverage:    PropTypes.object,
    seed:            PropTypes.object,
    onLoadingChange: PropTypes.func,
    onInitiated:     PropTypes.func,
    onSleeveResearched: PropTypes.func,
    coverage:        PropTypes.array,
}
