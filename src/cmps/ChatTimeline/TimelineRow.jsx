import { useState } from 'react'
import PropTypes from 'prop-types'
import { BotAvatarGlyph } from '../AxlHub/AgentSummon.jsx'
import { ChatBubble } from '../ChatBubble.jsx'
import { CardBubble } from '../SocialChat/ChatWindow.jsx'
import { openChart } from '../../services/chartSurface.service.js'
import { bubbleOf } from '../../services/session/sessionReducer.js'
import { ShowOffer } from './ShowOffer.jsx'
import { agentMeta, cardMessageOf } from './timelineRows.js'

// One row of the unified chat's timeline, by kind (plan phase 7, 7c). Every agent speaks in it; the speaker
// tag marks where the voice changes. What a row's buttons do is the app's existing doorways — a card's own
// bubble, the session's continue, the chart surface, the entity opener — never a second copy of them.

/** Who is talking — drawn when the voice changes, not on every row. */
export function SpeakerTag({ agent }) {
    const meta = agentMeta(agent)
    return (
        <div className={`chat-timeline__speaker chat-timeline__speaker--${meta.hue}`}>
            <span className="chat-timeline__speaker-icon"><BotAvatarGlyph agentKey={agent} size={18} /></span>
            <span className="chat-timeline__speaker-name">{meta.brand}</span>
        </div>
    )
}

SpeakerTag.propTypes = { agent: PropTypes.string.isRequired }

/** A reply's chart request (`ref.chart`, J2) — docks the live chart, like the user asking for it. */
function ChartOffer({ chart, agent }) {
    if (!chart?.ticker) return null
    return (
        <div className="portfolio-panel__action-bubble">
            <button type="button" className="portfolio-panel__review-btn" onClick={() => openChart({ ticker: chart.ticker, timeframe: chart.timeframe, source: agent })}>
                Chart {chart.ticker}{chart.timeframe ? ` · ${chart.timeframe}` : ''}
            </button>
        </div>
    )
}

ChartOffer.propTypes = { chart: PropTypes.object, agent: PropTypes.string }

/** A decision the chain is waiting on: the question and its taps — open only while it is the live one. */
function DecisionRow({ row, open, onChoose }) {
    const [busy, setBusy]   = useState(false)
    const [error, setError] = useState(null)
    const choices = row.ref?.choices ?? []

    async function pick(id) {
        setBusy(true); setError(null)
        const err = await onChoose(id)
        setBusy(false)
        if (err) setError(err)
    }

    return (
        <div className="chat-timeline__decision">
            <p className="chat-timeline__decision-text">{row.content}</p>
            {choices.length > 0 && (
                <div className="chat-timeline__decision-choices">
                    {choices.map(c => (
                        <button key={c.id} type="button" className="chat-timeline__choice" disabled={!open || busy} onClick={() => pick(c.id)}>
                            {c.label}
                        </button>
                    ))}
                </div>
            )}
            {error && <p className="chat-timeline__note chat-timeline__note--error">{error}</p>}
        </div>
    )
}

DecisionRow.propTypes = { row: PropTypes.object.isRequired, open: PropTypes.bool, onChoose: PropTypes.func.isRequired }

/**
 * @param {{ row: object, decisionOpen?: boolean, onChoose: Function, onResolveCard: Function,
 *           onOpenTicket?: Function, readOnly?: boolean }} props
 */
export function TimelineRow({ row, decisionOpen = false, onChoose, onResolveCard, onOpenTicket, readOnly = false }) {
    const kind = row.kind ?? 'msg'

    if (kind === 'handoff') {
        return (
            <div className="chat-timeline__handoff">
                <span className="chat-timeline__handoff-route">{agentMeta(row.agent).brand} → {agentMeta(row.to).brand}</span>
                <p className="chat-timeline__handoff-brief">{row.content}</p>
            </div>
        )
    }

    if (kind === 'decision') return <DecisionRow row={row} open={decisionOpen && !readOnly} onChoose={onChoose} />

    if (kind === 'sealed') return <div className="chat-timeline__sealed">{row.content}</div>

    if (kind === 'card') {
        // The card is gone from the store (or the read failed): its words still say what it was.
        if (!row.card) return <div className="chat-timeline__card chat-timeline__card--gone">{row.content}</div>
        // History: the card's words and how it ended — its buttons would open dialogs on a past session.
        if (readOnly) {
            const ended = row.card.status && row.card.status !== 'pending' ? ` · ${row.card.status}` : ''
            return <div className="chat-timeline__card chat-timeline__card--gone">{row.content}{ended}</div>
        }
        const msg = cardMessageOf(row)
        return (
            <div className="chat-timeline__card">
                <CardBubble msg={msg} onResolve={(_id, res) => onResolveCard(row, res)}
                    fallback={<div className="portfolio-panel__bubble portfolio-panel__bubble--assistant">{row.content}</div>} />
            </div>
        )
    }

    return (
        <>
            <ChatBubble msg={bubbleOf(row)} />
            {row.role === 'assistant' && !readOnly && (
                <>
                    <ChartOffer chart={row.ref?.chart} agent={row.agent} />
                    {row.ref?.show && <ShowOffer show={row.ref.show} onOpenTicket={onOpenTicket} />}
                </>
            )}
        </>
    )
}

TimelineRow.propTypes = {
    row:           PropTypes.object.isRequired,
    decisionOpen:  PropTypes.bool,
    onChoose:      PropTypes.func,
    onResolveCard: PropTypes.func,
    onOpenTicket:  PropTypes.func,
    readOnly:      PropTypes.bool,
}
