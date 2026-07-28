import PropTypes from 'prop-types'
import './ChatChartImage.scss'

/**
 * A chart the agent RENDERED and looked at, shown inline in its chat thread.
 *
 * ONE component for every agent (Idea, Kairos, Atlas, Mentor…): the row is the same picture with
 * the same caption wherever it lands, so it carries its own `chat-chart-image` namespace instead
 * of each panel's bubble classes. Panels reach it through ChatBubble; ChatPanel (whose message
 * loop predates ChatBubble) renders it directly.
 *
 * Not to be confused with the workspace ChartSurface — that's the LIVE interactive chart the user
 * asks for, and it opens in the lists panel. This is a still image the agent produced while
 * reasoning, and it belongs to the message that produced it.
 *
 * @param {{ imageBase64: string, symbol?: string, timeframe?: string }} msg
 */
export function ChatChartImage({ msg }) {
    if (!msg?.imageBase64) return null
    const caption = [msg.symbol, msg.timeframe].filter(Boolean).join(' · ')

    return (
        <div className="chat-chart-image">
            <img
                className="chat-chart-image__img"
                src={`data:image/png;base64,${msg.imageBase64}`}
                alt={`${msg.symbol ?? ''} ${msg.timeframe ?? ''} chart`.trim() || 'chart'}
                loading="lazy"
            />
            {caption && <span className="chat-chart-image__caption">{caption}</span>}
        </div>
    )
}

ChatChartImage.propTypes = {
    msg: PropTypes.shape({
        imageBase64: PropTypes.string,
        symbol:      PropTypes.string,
        timeframe:   PropTypes.string,
    }).isRequired,
}
