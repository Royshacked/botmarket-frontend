import { useState, useRef, useCallback } from 'react'
import PropTypes from 'prop-types'
import { ChatInputRow } from './ChatInputRow.jsx'
import { ChatChartDock } from './ChatChartDock.jsx'
import { useMicInput } from '../customHooks/useMicInput.js'

// The bottom of every agent chat: the docked chart, then the composer.
//
// ChatInputRow was already shared, but each panel still hand-wired the SAME eighteen props to it:
// the mic hook, the textarea ref, Enter-to-send, and six disabled flags all derived mechanically
// from (isLoading, inputText, mic state). Only the placeholder, the send/clear callbacks and one
// extra clear condition ever differed — so five panels carried ~20 lines of identical derivation
// each, and a fix to any of it had to be made five times.
//
// This owns the draft text and the mic, and derives the rest. A panel supplies what is actually
// its own: what the box says, what happens on send, and what its Clear means.
//
// It also renders the chart dock immediately above the input, which is why five panels needed no
// change to get one: ChatChartDock takes no props (it reads the shared chart store), and "just above
// the composer, outside the scrolling thread" is exactly where a docked chart belongs. Panels that
// build their own composer (ChatPanel, AxlChatPanel) render the dock themselves, in the same place.

export function AgentChatInput({
    chat,
    placeholder,
    onSend,
    onClear,
    onResume,
    busy = null,
    // An extra reason THIS panel's Clear is unavailable (e.g. mid-edit, where clearing would
    // abandon the thing being edited). Folded into the shared "streaming or nothing to clear".
    clearLocked = false,
    clearTitle = 'Clear chat',
    prefix = 'portfolio-panel',
}) {
    const [inputText, setInputText] = useState('')
    const textareaRef = useRef(null)

    // Dictation goes straight out as a turn — the same behaviour every panel had.
    const onTranscript = useCallback((text) => { if (text) onSend?.(text) }, [onSend])
    const { isRecording, isTranscribing, toggle: toggleMic, cancel: cancelMic } = useMicInput({ onTranscript })

    const isLoading = busy ?? chat?.isLoading ?? false

    function send() {
        const text = inputText.trim()
        if (!text) return
        setInputText('')
        onSend?.(text)
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
    }

    function clear() {
        setInputText('')
        onClear?.()
    }

    return (
        <>
            <ChatChartDock />
            <ChatInputRow
                prefix={prefix}
                textareaRef={textareaRef}
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                onSend={send}
                sendDisabled={!inputText.trim() || isLoading}
                isStreaming={isLoading}
                onStop={chat?.handleStop}
                canResume={chat?.canResume}
                onResume={onResume}
                onClear={onClear ? clear : undefined}
                clearDisabled={isLoading || clearLocked || !(chat?.messages?.length)}
                clearTitle={clearTitle}
                onToggleMic={toggleMic}
                onCancelMic={cancelMic}
                isRecording={isRecording}
                isTranscribing={isTranscribing}
                micDisabled={isLoading || isTranscribing}
                textareaDisabled={isLoading || isRecording}
            />
        </>
    )
}

AgentChatInput.propTypes = {
    chat:        PropTypes.object.isRequired,
    placeholder: PropTypes.string,
    onSend:      PropTypes.func,
    onClear:     PropTypes.func,
    onResume:    PropTypes.func,
    busy:        PropTypes.bool,
    clearLocked: PropTypes.bool,
    clearTitle:  PropTypes.string,
    prefix:      PropTypes.string,
}
