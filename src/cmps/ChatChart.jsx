import PropTypes from 'prop-types'
import './ChatChart.scss'

/**
 * A chart the AGENT rendered and looked at (get_chart with show_to_user), shown inline in its chat
 * thread. ONE component for every agent (Idea, Kairos, Atlas, Mentor, Analyst), so the row is the
 * same wherever it lands — hence its own `chat-chart` namespace instead of each panel's bubble
 * classes. Panels reach it through ChatBubble; ChatPanel and AxlChatPanel (own message loops) render
 * it directly.
 *
 * A STILL image on purpose, and the one chart in the app that is: it is evidence of what the model
 * actually saw, indicator overlays included, so it belongs to the turn that produced it and must not
 * quietly redraw itself. A chart the USER asked for is the live one, and it docks at the bottom of
 * the chat instead (cmps/ChatChartDock.jsx).
 *
 * No image renders nothing — never a broken img.
 *
 * @param {{ imageBase64: string, symbol?: string, timeframe?: string }} msg
 */
export function ChatChart({ msg }) {
    if (!msg?.imageBase64) return null
    const caption = [msg.symbol, msg.timeframe].filter(Boolean).join(' · ')

    return (
        <div className="chat-chart">
            {/* INTRINSIC SIZE, so the list reserves the space BEFORE the image decodes. Without
                it the auto-scroll ran against a zero-height img, the picture then appeared and
                pushed everything down, and the view was left sitting above a chart the user could
                not reach — worst at the spans gate, where the table already takes half the panel.
                Every chart this app renders is 800x600 (klineRender DEFAULT_W/H); the CSS still
                scales it to the column. */}
            <img
                className="chat-chart__img"
                src={`data:image/png;base64,${msg.imageBase64}`}
                alt={`${msg.symbol ?? ''} ${msg.timeframe ?? ''} chart`.trim() || 'chart'}
                width={800}
                height={600}
                loading="lazy"
            />
            {caption && <span className="chat-chart__caption">{caption}</span>}
        </div>
    )
}

ChatChart.propTypes = {
    msg: PropTypes.shape({
        imageBase64: PropTypes.string,
        symbol:      PropTypes.string,
        timeframe:   PropTypes.string,
    }).isRequired,
}
