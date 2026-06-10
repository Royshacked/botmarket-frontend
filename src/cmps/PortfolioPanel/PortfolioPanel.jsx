import { useState, useRef, useEffect } from 'react'
import PropTypes from 'prop-types'
import { portfolioService } from '../../services/portfolio/portfolio.service.remote.js'
import { AccountSelector } from '../ChatPanel/AccountSelector.jsx'
import './PortfolioPanel.scss'

function PieIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
            <path d="M22 12A10 10 0 0 0 12 2v10z" />
        </svg>
    )
}

function SendIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
    )
}

function TickerChip({ symbol, onSelect }) {
    return (
        <button className="portfolio-panel__ticker-chip" onClick={() => onSelect(symbol)}>
            {symbol}
            <span className="portfolio-panel__ticker-chip-hint">Build idea →</span>
        </button>
    )
}

function MessageBubble({ msg, onTickerSelect }) {
    const isUser = msg.role === 'user'

    if (isUser) {
        return <div className="portfolio-panel__bubble portfolio-panel__bubble--user">{msg.content}</div>
    }

    if (!msg.content && msg.streaming) {
        return (
            <div className="portfolio-panel__bubble portfolio-panel__bubble--assistant">
                <span className="portfolio-panel__typing">
                    <span /><span /><span />
                </span>
            </div>
        )
    }

    return (
        <div className="portfolio-panel__bubble portfolio-panel__bubble--assistant">
            <div className="portfolio-panel__bubble-text"
                dangerouslySetInnerHTML={{ __html: _renderMarkdown(msg.content) }} />
            {msg.tickers?.length > 0 && (
                <div className="portfolio-panel__tickers">
                    {msg.tickers.map(sym => (
                        <TickerChip key={sym} symbol={sym} onSelect={onTickerSelect} />
                    ))}
                </div>
            )}
        </div>
    )
}

// Minimal markdown renderer: bold, italic, code, lists, line breaks
function _renderMarkdown(text) {
    if (!text) return ''
    return text
        // Escape HTML first to prevent XSS
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        // Code spans
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        // Bold
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        // Italic
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        // Bullet lists (lines starting with - or *)
        .replace(/^[*-] (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
        // Line breaks
        .replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')
        // Wrap in paragraph
        .replace(/^(?!<[uop]|<li)(.+)/gm, (_, m) => `<p>${m}</p>`)
}

export function PortfolioPanel({
    onTickerSelect,
    onGeneratePlan,
    availableAccounts = [],
    selectedAccounts  = [],
    onAccountsChange,
    mainAccountId     = null,
    onMainAccountChange,
}) {
    const [messages,    setMessages]    = useState([])
    const [inputText,   setInputText]   = useState('')
    const [isLoading,   setIsLoading]   = useState(false)
    const [pendingPlan, setPendingPlan] = useState(null)

    const tokenQueueRef    = useRef('')
    const drainTimerRef    = useRef(null)
    const pendingTickersRef = useRef([])
    const messagesEndRef   = useRef(null)
    const textareaRef      = useRef(null)

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    function _startDrain() {
        if (drainTimerRef.current) return
        drainTimerRef.current = setInterval(() => {
            const q = tokenQueueRef.current
            if (!q.length) return
            const chunk = q.slice(0, 1)
            tokenQueueRef.current = q.slice(1)
            setMessages(prev => {
                const msgs = [...prev]
                const last = msgs[msgs.length - 1]
                if (!last?.streaming) return prev
                msgs[msgs.length - 1] = { ...last, content: last.content + chunk }
                return msgs
            })
        }, 60)
    }

    function _stopDrain() {
        clearInterval(drainTimerRef.current)
        drainTimerRef.current = null
        tokenQueueRef.current = ''
    }

    async function handleSend() {
        const text = inputText.trim()
        if (!text || isLoading) return

        // Build history from current messages (strip streaming flag + tickers for API)
        const history = messages
            .filter(m => !m.streaming)
            .map(m => ({ role: m.role, content: m.content }))
        history.push({ role: 'user', content: text })

        const ideaAccounts = availableAccounts.filter(a => selectedAccounts.includes(a.id))

        setMessages(prev => [
            ...prev,
            { role: 'user', content: text },
            { role: 'assistant', content: '', streaming: true },
        ])
        setInputText('')
        setIsLoading(true)
        pendingTickersRef.current = []
        _startDrain()

        try {
            await portfolioService.sendStream(history, ideaAccounts, {
                onToken: (t) => { tokenQueueRef.current += t },

                onTicker: (symbol) => {
                    if (!pendingTickersRef.current.includes(symbol)) {
                        pendingTickersRef.current.push(symbol)
                    }
                },

                onDone: (data) => {
                    _stopDrain()
                    const tickers = [...pendingTickersRef.current]
                    pendingTickersRef.current = []
                    setMessages(prev => {
                        const msgs = [...prev]
                        const last = msgs[msgs.length - 1]
                        if (last?.streaming) {
                            msgs[msgs.length - 1] = { role: 'assistant', content: data.reply, tickers }
                        }
                        return msgs
                    })
                    if (data.plan?.ideas?.length) setPendingPlan(data.plan)
                },

                onError: (message) => {
                    _stopDrain()
                    setMessages(prev => {
                        const msgs = [...prev]
                        const last = msgs[msgs.length - 1]
                        if (last?.streaming) {
                            msgs[msgs.length - 1] = { role: 'assistant', content: message || 'Error communicating with the server.' }
                        }
                        return msgs
                    })
                },
            })
        } catch (err) {
            console.error('[portfolio]', err)
            _stopDrain()
            setMessages(prev => {
                const msgs = [...prev]
                const last = msgs[msgs.length - 1]
                if (last?.streaming) {
                    msgs[msgs.length - 1] = { role: 'assistant', content: 'Error communicating with the server.' }
                }
                return msgs
            })
        } finally {
            setIsLoading(false)
        }
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    return (
        <div className="portfolio-panel">
            <div className="portfolio-panel__header">
                <span className="portfolio-panel__title-icon"><PieIcon /></span>
                <span className="portfolio-panel__title">Portfolio Tradvisor</span>
                <div className="portfolio-panel__header-right">
                    <AccountSelector
                        accounts={availableAccounts}
                        selectedIds={selectedAccounts}
                        onChange={onAccountsChange}
                        mainAccountId={mainAccountId}
                        onMainChange={onMainAccountChange}
                    />
                    <div className={`portfolio-panel__status-dot${isLoading ? ' loading' : ' idle'}`} />
                </div>
            </div>

            <div className="portfolio-panel__messages">
                {messages.length === 0 && (
                    <div className="portfolio-panel__empty">
                        Describe your investment goals, risk tolerance, and account size — I'll help you build a portfolio.
                    </div>
                )}
                {messages.map((msg, i) => (
                    <MessageBubble key={i} msg={msg} onTickerSelect={onTickerSelect} />
                ))}
                <div ref={messagesEndRef} />
            </div>

            {pendingPlan && (
                <div className="portfolio-panel__plan-banner">
                    <div className="portfolio-panel__plan-info">
                        <span className="portfolio-panel__plan-name">{pendingPlan.name}</span>
                        <span className="portfolio-panel__plan-count">{pendingPlan.ideas.length} ideas ready</span>
                    </div>
                    <div className="portfolio-panel__plan-actions">
                        <button className="portfolio-panel__plan-dismiss" onClick={() => setPendingPlan(null)}>
                            Dismiss
                        </button>
                        <button
                            className="portfolio-panel__plan-generate"
                            onClick={() => { if (onGeneratePlan) onGeneratePlan(pendingPlan); setPendingPlan(null) }}
                        >
                            Generate ideas ↑
                        </button>
                    </div>
                </div>
            )}

            <div className="portfolio-panel__input-row">
                <textarea
                    ref={textareaRef}
                    className="portfolio-panel__textarea"
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about portfolio construction…"
                    rows={1}
                    disabled={isLoading}
                />
                <button
                    className="portfolio-panel__send"
                    onClick={handleSend}
                    disabled={!inputText.trim() || isLoading}
                    title="Send"
                >
                    <SendIcon />
                </button>
            </div>
        </div>
    )
}

PortfolioPanel.propTypes = {
    onTickerSelect:      PropTypes.func.isRequired,
    onGeneratePlan:      PropTypes.func,
    availableAccounts:   PropTypes.array,
    selectedAccounts:    PropTypes.arrayOf(PropTypes.string),
    onAccountsChange:    PropTypes.func,
    mainAccountId:       PropTypes.string,
    onMainAccountChange: PropTypes.func,
}
