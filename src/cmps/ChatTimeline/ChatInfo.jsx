import { useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import { useAuth } from '../../context/AuthContext.jsx'
import { AGENTS, DESKS } from '../AxlHub/agentMeta.jsx'

// INFO WHILE CHATTING, on a phone (Roy, 2026-10-29: "add an info tab when chatting"). The Floor's Info column sits beside
// the chat on a desktop; a phone has no room for it, so the chat header carries an Info button that opens this over the
// chat, like History: who you are talking to and what they do, then every desk Axl can take you to. The copy is
// agentMeta's — the same words the desks introduce themselves with, one source.

const AXL_ABOUT = 'Axl is the front desk: say what you want to do and he takes you to the desk for it, or answers himself.'

export function ChatInfo({ floor = 'axl', onClose }) {
    const { isAdmin } = useAuth()
    const closeRef = useRef(null)
    const agent = floor && floor !== 'axl' ? AGENTS[floor] ?? null : null
    const desks = DESKS.filter(d => !d.adminOnly || isAdmin)
    useEffect(() => {
        closeRef.current?.focus()
        // Captured and claimed, as History's: one Esc closes this, not what is under it too.
        const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); onClose() } }
        document.addEventListener('keydown', onKey, true)
        return () => document.removeEventListener('keydown', onKey, true)
    }, [onClose])
    return (
        <div className="chat-timeline__history chat-info" role="dialog" aria-modal="true" aria-label="Info">
            <div className="chat-timeline__history-head">
                <span className="chat-timeline__history-title">Info</span>
                <button type="button" className="chat-timeline__history-close" onClick={onClose} aria-label="Close" ref={closeRef}>×</button>
            </div>
            <div className="chat-info__body">
                <section className="chat-info__sec">
                    <h3 className="chat-info__head">Talking with {agent?.brand ?? 'Axl'}{agent?.role ? <span className="chat-info__role"> · {agent.role}</span> : null}</h3>
                    <p className="chat-info__text">{agent?.blurb ?? AXL_ABOUT}</p>
                    {agent?.hint && <p className="chat-info__text chat-info__text--dim">{agent.hint}</p>}
                </section>
                <section className="chat-info__sec">
                    <h3 className="chat-info__head">The desks</h3>
                    <dl className="chat-info__desks">
                        {desks.map(d => (
                            <div key={d.key}>
                                <dt>{d.label}<span className="chat-info__role"> · {AGENTS[d.agentKey]?.brand ?? d.agentKey}</span></dt>
                                <dd>{d.blurb}</dd>
                            </div>
                        ))}
                    </dl>
                </section>
            </div>
        </div>
    )
}
ChatInfo.propTypes = { floor: PropTypes.string, onClose: PropTypes.func.isRequired }
