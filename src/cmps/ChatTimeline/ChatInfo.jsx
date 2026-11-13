import { useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import { useAuth } from '../../context/AuthContext.jsx'
import { AGENTS, DESKS } from '../AxlHub/agentMeta.jsx'
import { RiskBasedInfo } from '../Floor/RiskBasedInfo.jsx'
import { FlowDiagram } from '../Floor/FlowDiagram.jsx'
import { infoFlow } from '../Floor/infoFlow.js'
import { useDetailPanel } from '../DetailPanel/detailPanel.store.js'
import { HOTLIST_PANEL_ID } from '../Floor/HotlistPanel.jsx'

// INFO WHILE CHATTING, on a phone (Roy, 2026-10-29: "add an info tab when chatting"). The Floor's Info column sits beside
// the chat on a desktop; a phone has no room for it, so the chat header carries an Info button that opens this over the
// chat, like History. Since one-axl.md step 5 (2026-11-13) it opens on the DIAGRAM of the flow the user is in, the step
// they are on lit (infoFlow — the same one the desktop column draws); who is at work and what they do sit behind "More",
// then what Axl can do. The copy is agentMeta's — one source.

const AXL_ABOUT = 'I am Axl, your assistant: say what you want to do and I answer it, or put the right role to work on it.'

export function ChatInfo({ floor = 'axl', agentState = {}, rows = [], onClose }) {
    const { isAdmin } = useAuth()
    const closeRef = useRef(null)
    const hotlistOpen = useDetailPanel(HOTLIST_PANEL_ID).isOpen
    const agent = floor && floor !== 'axl' ? AGENTS[floor] ?? null : null
    const desks = DESKS.filter(d => !d.adminOnly || isAdmin)
    const flow = infoFlow({ floor, agentState, rows, hotlistOpen })
    useEffect(() => {
        closeRef.current?.focus()
        // Captured and claimed, as History's: one Esc closes this, not what is under it too.
        const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); onClose() } }
        document.addEventListener('keydown', onKey, true)
        return () => document.removeEventListener('keydown', onKey, true)
    }, [onClose])
    const about = (
        <>
            <p className="chat-info__text">{agent?.blurb ?? AXL_ABOUT}</p>
            {agent?.hint && <p className="chat-info__text chat-info__text--dim">{agent.hint}</p>}
            {floor === 'mentor' && <RiskBasedInfo />}
        </>
    )
    return (
        <div className="chat-timeline__history chat-info" role="dialog" aria-modal="true" aria-label="Info">
            <div className="chat-timeline__history-head">
                <span className="chat-timeline__history-title">Info</span>
                <button type="button" className="chat-timeline__history-close" onClick={onClose} aria-label="Close" ref={closeRef}>×</button>
            </div>
            <div className="chat-info__body">
                <section className="chat-info__sec">
                    <h3 className="chat-info__head">Talking with Axl{agent?.role ? <span className="chat-info__role"> · {agent.role}</span> : null}</h3>
                    <FlowDiagram flow={flow} />
                    {flow ? <details className="floor-info__more"><summary>More</summary>{about}</details> : about}
                </section>
                <section className="chat-info__sec">
                    <h3 className="chat-info__head">What I can do</h3>
                    <dl className="chat-info__desks">
                        {desks.map(d => (
                            <div key={d.key}>
                                <dt>{d.label}<span className="chat-info__role"> · {AGENTS[d.agentKey]?.role ?? d.agentKey}</span></dt>
                                <dd>{d.blurb}</dd>
                            </div>
                        ))}
                    </dl>
                </section>
            </div>
        </div>
    )
}
ChatInfo.propTypes = { floor: PropTypes.string, agentState: PropTypes.object, rows: PropTypes.array, onClose: PropTypes.func.isRequired }
