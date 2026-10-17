import { useRef } from 'react'
import PropTypes from 'prop-types'
import { aetherService } from '../../services/aether/aether.service.remote.js'
import { threadsService, newThreadId, clearThread } from '../../services/threads/threads.service.remote.js'
import { readStoredModel } from '../modelOptions.js'
import { useChatStream, toChatHistory, withoutPrefill } from '../../customHooks/useChatStream.js'
import { AgentMessages } from '../AgentMessages.jsx'
import { AgentChatInput } from '../AgentChatInput.jsx'
import { RouteOffer } from '../RouteOffer.jsx'
import { useRouteOffer } from '../../customHooks/useRouteOffer.js'
import { useSeedTurn } from '../../customHooks/useSeedTurn.js'
import { AGENTS } from '../AxlHub/agentMeta.jsx'
import { AgentIntro, AgentTurnTag } from '../AxlHub/AgentGlyphs.jsx'
import { ChatBubble } from '../ChatBubble.jsx'
import { ToolStatusChip } from '../ToolStatusChip/ToolStatusChip.jsx'
import { waitingLabel } from '../ToolStatusChip/waitingLabel.js'
import './AetherPanel.scss'

// Aether's desk. Purely conversational — no emit tags, no artifacts to publish. The desk reasons
// qualitatively from LLM knowledge while the Python engine is offline, and says so when asked.

const MessageBubble = ({ msg }) => <ChatBubble msg={msg} />
MessageBubble.propTypes = { msg: PropTypes.object.isRequired }

export function AetherPanel({ seed = null, onRoute }) {
    const chat = useChatStream()
    // The user asked, in the chat, to be sent to another desk with a name → the reply routed →
    // the RouteOffer button. The shared hand-off every desk has (useRouteOffer).
    const routeOffer = useRouteOffer()
    const { messages, isLoading } = chat
    const threadIdRef = useRef(newThreadId())

    // A DRAFT THREAD per conversation — still saved since phase 8e, reopened again once Aether is on the session (D1).
    function _saveThread(msgs, phase) {
        threadsService.saveDraft({
            threadId: threadIdRef.current, agent: 'aether',
            messages: msgs, phase: phase ?? null, subjectType: null,
            state: null,
        })
    }

    // A routed arrival's opening sentence — Axl's `<open>` ("which names does the port strike
    // reach?") — sent as the desk's next turn, once per key. See useSeedTurn.
    useSeedTurn(seed, (text) => _send(text))

    async function _send(text) {
        routeOffer.clear()
        const history = toChatHistory(messages)
        history.push({ role: 'user', content: text })

        await chat.run(text, {
            log: '[aether]',
            onStopped: () => _saveThread(history, chat.phase),
            onDone: (data) => {
                chat.finishStreaming({ role: 'assistant' })
                routeOffer.capture(data)
                _saveThread([...history, { role: 'assistant', content: data.reply }], data.phase)
            },
            send: ({ signal, handlers }) => aetherService.sendStream(history, {
                model:  readStoredModel(),
                signal,
                ...handlers,
            }),
        })
    }

    async function _continue() {
        if (isLoading) return
        const last = messages[messages.length - 1]
        if (!last || last.role !== 'assistant' || !last.stopped) return
        const base = chat.resumeBase()
        const history = chat.finalizeResumeHistory(toChatHistory(messages), base)
        const cont = chat.beginContinue({
            onError: () => chat.restoreStopped(base),
            onDone: (data) => {
                chat.finishStreaming({ role: 'assistant', content: base + data.reply })
                routeOffer.capture(data)
                _saveThread([...withoutPrefill(history), { role: 'assistant', content: base + data.reply }], data.phase)
            },
        })
        if (!cont) return
        try {
            await aetherService.sendStream(history, {
                model:  readStoredModel(),
                signal: cont.signal,
                ...cont.handlers,
            })
        } catch (err) {
            console.error('[aether]', err)
            chat.restoreStopped(base)
        } finally {
            chat.endStream()
        }
    }

    function handleClear() { chat.reset(); routeOffer.clear(); clearThread(threadIdRef) }

    return (
        <div className="aether-panel">
            <AgentMessages chat={chat}>
                {messages.length === 0 && <AgentIntro agent={AGENTS.aether} />}
                {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
                {isLoading && <ToolStatusChip label={waitingLabel({ messages, streamStatus: chat.streamStatus, placeholder: 'reading the filings…' })} pulse={chat.reasoningPulse} />}
                {(isLoading || messages.some(m => m.role === 'assistant' && m.content)) && (
                    <AgentTurnTag agent={AGENTS.aether} active={isLoading} />
                )}
            </AgentMessages>

            {/* The user asked to be sent to another desk with a name — the shared offer. */}
            <RouteOffer offer={routeOffer.offer} busy={chat.isLoading} onGo={(o) => { routeOffer.clear(); onRoute?.(o) }} onDismiss={routeOffer.clear} />

            <AgentChatInput
                chat={chat}
                placeholder="Ask which names an event reaches, or why one is on the list (Enter to send)"
                onSend={_send}
                onClear={handleClear}
                onResume={_continue}
            />
        </div>
    )
}

AetherPanel.propTypes = {
    onRoute:         PropTypes.func,     // (offer) → MainPage's doorway: the user asked to be sent to another desk
}
