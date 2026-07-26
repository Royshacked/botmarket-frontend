import { useState, useRef, useEffect } from 'react'
import PropTypes from 'prop-types'
import { analystService } from '../../services/analyst/analyst.service.remote.js'
import { readStoredModel } from '../modelOptions.js'
import { readStoredReasoning } from '../reasoningOptions.js'
import { useChatStream, toChatHistory } from '../../customHooks/useChatStream.js'
import { useChatScroll } from '../../customHooks/useChatScroll.js'
import { ChatInputRow } from '../ChatInputRow.jsx'
import { ChatBubble } from '../ChatBubble.jsx'
import { ToolStatusChip } from '../ToolStatusChip/ToolStatusChip.jsx'
import '../PortfolioPanel/PortfolioPanel.scss'
import './AnalystPanel.scss'

const ANALYST_PHASE_LABELS = { 1: 'Profile', 2: 'The Street', 3: 'Our view', 4: 'Valuation', 5: 'The call', 6: 'Coverage' }

const MessageBubble = ({ msg }) => (
    <ChatBubble msg={msg} phaseLabels={ANALYST_PHASE_LABELS} phaseTotal={6} placeholder="researching…" />
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

export function AnalystPanel({ scanResult = null, onLoadingChange, onInitiated, coverage = [] }) {
    const chat = useChatStream({ threadPhases: true })
    const { messages, isLoading } = chat
    const [inputText, setInputText] = useState('')
    const [pendingCoverage, setPendingCoverage] = useState(null)
    const [initiateErr, setInitiateErr] = useState('')
    const textareaRef = useRef(null)
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

    const { messagesRef, messagesEndRef, handleScroll } = useChatScroll(messages, { watch: chat.streamStatus })

    useEffect(() => { onLoadingChange?.(isLoading) }, [isLoading])   // eslint-disable-line react-hooks/exhaustive-deps

    async function _send(text) {
        if (!text || isLoading) return
        setInputText('')
        setInitiateErr('')
        const seed = seedRef.current; seedRef.current = null
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
                chatState:       { active_symbol: pendingRef.current?.symbol || seed?.ticker || '', draft: pendingRef.current, existing_coverage: existingRef.current },
                seed,            // structured Argus investing candidate (one-shot on the hand-off turn)
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

    function handleSend()      { const t = inputText.trim(); if (t) _send(t) }
    function handleKeyDown(e)  { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }
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
            <div className="portfolio-panel__messages" ref={messagesRef} onScroll={handleScroll}>
                {messages.length === 0 && (
                    <div className="analyst-panel__intro">
                        <h3>Prometheus</h3>
                        <p>Buy-side research — a living thesis per name: a variant view, our price target vs the Street, and monitorable kill-criteria. Name a ticker (or open one from an Argus investing list).</p>
                    </div>
                )}
                {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
                {isLoading && <ToolStatusChip label={chat.streamStatus} />}
                <div ref={messagesEndRef} />
            </div>

            {!isLoading && pendingCoverage && (
                <div className="analyst-panel__draft-wrap">
                    <CoverageDraft coverage={pendingCoverage} />
                    {initiateErr && <div className="analyst-panel__err">{initiateErr}</div>}
                    <button className="portfolio-panel__review-btn portfolio-panel__review-btn--update" onClick={handleInitiate}>
                        {existingCoverage ? `Update coverage on ${pendingCoverage.symbol}` : `Initiate coverage on ${pendingCoverage.symbol}`}
                    </button>
                </div>
            )}

            <ChatInputRow
                prefix="portfolio-panel"
                textareaRef={textareaRef}
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="A ticker to research — e.g. “Cover NVDA” (Enter to send)"
                onSend={handleSend}
                sendDisabled={!inputText.trim() || isLoading}
                isStreaming={isLoading}
                onStop={chat.handleStop}
                canResume={chat.canResume}
                onResume={_continue}
                onClear={handleClear}
                clearDisabled={isLoading || !messages.length}
                clearTitle="Clear chat"
            />
        </div>
    )
}
AnalystPanel.propTypes = {
    scanResult:      PropTypes.object,
    onLoadingChange: PropTypes.func,
    onInitiated:     PropTypes.func,
    coverage:        PropTypes.array,
}
