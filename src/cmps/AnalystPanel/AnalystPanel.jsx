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

export function AnalystPanel({ scanResult = null, editCoverage = null, seed = null, onLoadingChange, onInitiated, coverage = [] }) {
    const chat = useChatStream({ threadPhases: true })
    const { messages, isLoading } = chat
    const [pendingCoverage, setPendingCoverage] = useState(null)
    const [initiateErr, setInitiateErr] = useState('')
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

    // Argus investing candidate handed over → seed the research (fires once per keyed result).
    useEffect(() => {
        if (!scanResult?.ticker) return
        seedRef.current = { ticker: scanResult.ticker, sector: scanResult.sector ?? null, thesis: scanResult.thesis ?? null, analysis: scanResult.analysis ?? null }
        _send(`Research ${scanResult.ticker} for coverage.`)
    }, [scanResult?.key])   // eslint-disable-line react-hooks/exhaustive-deps

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
            onInitiated?.(saved)
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
                    onInitiated?.(saved)
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
                {isLoading && <ToolStatusChip label={waitingLabel({ messages, streamStatus: chat.streamStatus, placeholder: 'researching…' })} />}
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
    coverage:        PropTypes.array,
}
