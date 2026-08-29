import { useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import { aetherService } from '../../services/aether/aether.service.remote.js'
import { threadsService, newThreadId, clearThread } from '../../services/threads/threads.service.remote.js'
import { readStoredModel } from '../modelOptions.js'
import { useChatStream, toChatHistory, withoutPrefill } from '../../customHooks/useChatStream.js'
import { AgentMessages } from '../AgentMessages.jsx'
import { AgentChatInput } from '../AgentChatInput.jsx'
import { AGENTS } from '../AxlHub/agentMeta.jsx'
import { AgentIntro, AgentTurnTag } from '../AxlHub/AgentSummon.jsx'
import { ChatBubble } from '../ChatBubble.jsx'
import { ToolStatusChip } from '../ToolStatusChip/ToolStatusChip.jsx'
import { waitingLabel } from '../ToolStatusChip/waitingLabel.js'
import './AetherPanel.scss'

// Aether's desk. Purely conversational — no emit tags, no artifacts to publish. The desk reasons
// qualitatively from LLM knowledge while the Python engine is offline, and says so when asked.

const MessageBubble = ({ msg }) => <ChatBubble msg={msg} />
MessageBubble.propTypes = { msg: PropTypes.object.isRequired }

export function AetherPanel({ onLoadingChange, pipeline = null, resumeRef = null }) {
    const chat = useChatStream()
    const { messages, isLoading } = chat
    const threadIdRef = useRef(newThreadId())

    useEffect(() => { onLoadingChange?.(isLoading) }, [isLoading])   // eslint-disable-line react-hooks/exhaustive-deps

    function _saveThread(msgs, phase) {
        threadsService.saveDraft({
            pipeline,
            threadId: threadIdRef.current, agent: 'aether',
            messages: msgs, phase: phase ?? null, subjectType: null,
            state: null,
        })
    }

    async function _send(text) {
        const history = toChatHistory(messages)
        history.push({ role: 'user', content: text })

        await chat.run(text, {
            log: '[aether]',
            onStopped: () => _saveThread(history, chat.phase),
            onDone: (data) => {
                chat.finishStreaming({ role: 'assistant' })
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

    function handleClear() { chat.reset(); clearThread(threadIdRef) }

    async function handleResumeThread(threadId) {
        const t = await threadsService.getThread(threadId)
        if (!t) return
        chat.setMessages(t.messages ?? [])
        threadIdRef.current = t.threadId
    }
    if (resumeRef) resumeRef.current = handleResumeThread

    return (
        <div className="aether-panel">
            <AgentMessages chat={chat}>
                {messages.length === 0 && <AgentIntro agent={AGENTS.aether} />}
                {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
                {isLoading && <ToolStatusChip label={waitingLabel({ messages, streamStatus: chat.streamStatus, placeholder: 'reading the channels…' })} pulse={chat.reasoningPulse} />}
                {(isLoading || messages.some(m => m.role === 'assistant' && m.content)) && (
                    <AgentTurnTag agent={AGENTS.aether} active={isLoading} />
                )}
            </AgentMessages>

            <AgentChatInput
                chat={chat}
                placeholder="Ask about the channel state, a regime, or a name's exposure (Enter to send)"
                onSend={_send}
                onClear={handleClear}
                onResume={_continue}
            />
        </div>
    )
}

AetherPanel.propTypes = {
    onLoadingChange: PropTypes.func,
    pipeline:        PropTypes.string,
    resumeRef:       PropTypes.object,
}
