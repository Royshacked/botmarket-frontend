import PropTypes from 'prop-types'
import { useChatScroll } from '../customHooks/useChatScroll.js'

// The scrolling message region every agent chat renders into.
//
// Deliberately a WRAPPER, not a renderer. The contents genuinely differ per agent — Analyst uses
// its own intro rather than AgentIntro, Portfolio injects a warning bubble mid-list, Scanner
// branches on edit mode, Kairos threads phase headings — so a component that owned the list would
// have to grow a flag per panel and would be a worse abstraction than the duplication.
//
// What IS identical in all five is the plumbing around it: the scroll container, the two refs, the
// scroll handler, the bottom anchor, and the useChatScroll wiring that refocuses the composer when
// a turn finishes. That is what this owns.

export function AgentMessages({ chat, watch = '', onFinishStreaming, className = '', children }) {
    const { messagesRef, messagesEndRef, handleScroll } = useChatScroll(chat.messages, {
        onFinishStreaming,
        watch: `${chat.streamStatus}|${watch}`,
    })

    return (
        <div className={`portfolio-panel__messages ${className}`.trim()} ref={messagesRef} onScroll={handleScroll}>
            {children}
            <div ref={messagesEndRef} />
        </div>
    )
}

AgentMessages.propTypes = {
    chat:              PropTypes.object.isRequired,
    // Extra state that should re-trigger the stick-to-bottom check (a preview appearing, a
    // picker opening — anything that changes the region's height without adding a message).
    watch:             PropTypes.string,
    onFinishStreaming: PropTypes.func,
    className:         PropTypes.string,
    children:          PropTypes.node,
}
