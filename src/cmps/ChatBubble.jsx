import PropTypes from 'prop-types'
import { ChatMarkdown } from './ChatMarkdown.jsx'
import { ChatReasoning } from './ChatReasoning.jsx'
import { ChatPhaseHeading } from './ChatPhaseHeading.jsx'
import { ChatChart } from './ChatChart.jsx'
import { ToolStatusChip } from './ToolStatusChip/ToolStatusChip.jsx'
// The bubble styles live in PortfolioPanel.scss under the shared `portfolio-panel__*`
// namespace (every agent panel already renders into it). Imported here so this
// component's styling is explicit rather than relying on whichever panel loaded first.
import './PortfolioPanel/PortfolioPanel.scss'

/**
 * One assistant/user/phase message row, shared by every agent panel (Atlas, Argus,
 * Kairos, Analyst). This was five near-identical local `MessageBubble` copies that
 * differed only in the phase-label map, the placeholder word, and whether ticker
 * chips render — so those are the props.
 *
 * AxlChatPanel deliberately keeps its own bubble: different SCSS namespace
 * (`axl-chat__*`). The waiting placeholder is NOT bespoke though — every panel
 * renders the one shared ToolStatusChip, so "thinking…" and "fetching…" are the
 * same mark.
 *
 * @param {object}   msg            message row ({ role, content, reasoning, streaming, phase, tickers })
 * @param {object}   [phaseLabels]  phase number → label, for `role: 'phase'` rows
 * @param {number}   [phaseTotal]   how many phases this agent has (renders "n / total")
 * @param {string}   [placeholder]  what to show while streaming with no content yet
 * @param {Function} [onTickerSelect] omit to hide ticker chips entirely
 * @param {string}   [tickerHint]   hover hint on a ticker chip
 */
export function ChatBubble({
    msg,
    phaseLabels    = null,
    phaseTotal     = 0,
    placeholder    = 'thinking…',
    onTickerSelect = null,
    tickerHint     = 'View →',
}) {
    // A history-only note (a wordless turn that docked a chart). It exists so the thread the model
    // sees still alternates; there is nothing for the user to read.
    if (msg.hidden) return null
    if (msg.role === 'phase') {
        return <ChatPhaseHeading phase={msg.phase} label={phaseLabels?.[msg.phase]} total={phaseTotal} />
    }
    // A chart the agent rendered mid-turn. Every agent that surfaces one renders it through the
    // same component — the row arrives here because useChatStream inserts it for ALL of them.
    if (msg.type === 'chart') {
        return <ChatChart msg={msg} />
    }
    if (msg.role === 'user') {
        return <div className="portfolio-panel__bubble portfolio-panel__bubble--user">{msg.content}</div>
    }

    const reasoning = <ChatReasoning text={msg.reasoning} live={msg.streaming && !msg.content} />

    if (!msg.content && msg.streaming) {
        return (
            <div className="portfolio-panel__bubble portfolio-panel__bubble--assistant">
                {reasoning}
                <ToolStatusChip label={placeholder} />
            </div>
        )
    }

    return (
        <div className="portfolio-panel__bubble portfolio-panel__bubble--assistant">
            {reasoning}
            <div className="portfolio-panel__bubble-text">
                <ChatMarkdown>{msg.content}</ChatMarkdown>
            </div>
            {onTickerSelect && msg.tickers?.length > 0 && (
                <div className="portfolio-panel__tickers">
                    {msg.tickers.map(sym => (
                        <TickerChip key={sym} symbol={sym} hint={tickerHint} onSelect={onTickerSelect} />
                    ))}
                </div>
            )}
        </div>
    )
}

function TickerChip({ symbol, hint, onSelect }) {
    return (
        <button className="portfolio-panel__ticker-chip" onClick={() => onSelect(symbol)}>
            {symbol}
            <span className="portfolio-panel__ticker-chip-hint">{hint}</span>
        </button>
    )
}

TickerChip.propTypes = {
    symbol:   PropTypes.string.isRequired,
    hint:     PropTypes.string,
    onSelect: PropTypes.func.isRequired,
}

ChatBubble.propTypes = {
    msg:            PropTypes.object.isRequired,
    phaseLabels:    PropTypes.object,
    phaseTotal:     PropTypes.number,
    placeholder:    PropTypes.string,
    onTickerSelect: PropTypes.func,
    tickerHint:     PropTypes.string,
}
