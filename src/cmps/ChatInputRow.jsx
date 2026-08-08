import { useCallback, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import './ChatInputRow.scss'

/**
 * Shared chat input row: mic toggle, textarea, send/stop, and clear.
 *
 * ONE shared style for every agent (idea / portfolio / scanner / axl) via the
 * fixed `.chat-input-row` classes + ChatInputRow.scss — no per-panel duplication.
 * `prefix` is kept as an optional root modifier (`chat-input-row--<prefix>`) for
 * any panel-specific tweak, but all base styling lives in the shared stylesheet.
 * All disabled/visibility logic is decided by the parent and passed in.
 *
 * `empty` = this chat has no thread yet. It's the landing state: the composer
 * lifts off the floor and grows, because on an empty screen it IS the subject.
 * The first turn drops it back to the docked pill. Panels decide what "empty"
 * means for them (no messages / no thread) and pass it in.
 *
 * The cursor comes back here the moment an agent finishes talking — a reply ends,
 * the box is live again, you type. That lives HERE, once, because every agent chat
 * (the six panels via AgentChatInput, plus ChatPanel and Axl, who wire their own)
 * renders this one row: no panel opts in, and no panel can drift. Desktop only: on
 * touch, focus means the on-screen keyboard, which is the user's tap to make.
 */
export function ChatInputRow({
    prefix,
    empty = false,
    textareaRef,
    value,
    onChange,
    onKeyDown,
    placeholder,
    onSend,
    sendDisabled,
    isStreaming,
    onStop,
    canResume,
    onResume,
    onClear,
    clearDisabled,
    clearTitle = 'Clear chat',
    onToggleMic,
    onCancelMic,
    isRecording,
    isTranscribing,
    micDisabled,
    textareaDisabled,
}) {
    // The row keeps its own handle on the textarea so the focus-return below never depends on a
    // panel remembering to pass `textareaRef`; a panel that does pass one still gets it filled.
    const innerRef = useRef(null)
    const setTextarea = useCallback((el) => {
        innerRef.current = el
        if (typeof textareaRef === 'function') textareaRef(el)
        else if (textareaRef) textareaRef.current = el
    }, [textareaRef])

    // "…(Enter to send, Shift+Enter for newline)" is a hardware-keyboard instruction, and in a few
    // panels it's longer than the sentence it qualifies. On a phone there is no Shift+Enter to
    // press, so it's a false hint that costs the field two extra wrapped lines — drop it and leave
    // the panel's actual subject. One rule here beats eight panels each branching their own copy.
    const shownPlaceholder = isTouchPrimary() ? placeholder?.replace(KEYBOARD_HINT, '') : placeholder

    const wasStreaming = useRef(false)
    useEffect(() => {
        const finished = wasStreaming.current && !isStreaming
        wasStreaming.current = !!isStreaming
        if (!finished) return

        // On a touch device, focusing the box also raises the on-screen keyboard — which would
        // cover the reply the user just waited for. There the cursor stays where it is; tapping
        // the composer is the gesture that opens the keyboard, and it stays the user's to make.
        if (isTouchPrimary()) return

        const el = innerRef.current
        // A hidden composer must not pull the cursor out of the chat the user is looking at: the
        // workspace keeps every panel MOUNTED and hides the inactive ones with `display: none`, so
        // a background agent finishing is a live component with an off-screen textarea.
        if (!el || el.disabled || !isVisible(el)) return
        // Nor may a reply landing in the background steal a field the user is mid-way through.
        const active = document.activeElement
        if (active && active !== el && active !== document.body && active !== document.documentElement) return
        // preventScroll: the thread is mid-autoscroll to the bottom of the new reply; focusing must
        // put the cursor in the box, not yank the scroll position with it.
        el.focus({ preventScroll: true })
    }, [isStreaming])

    return (
        <div className={`chat-input-row${prefix ? ` chat-input-row--${prefix}` : ''}${empty ? ' chat-input-row--empty' : ''}`}>
            <button
                className={`chat-input-row__mic ${isRecording ? 'recording' : ''} ${isTranscribing ? 'transcribing' : ''}`}
                onClick={onToggleMic}
                disabled={micDisabled}
                title={isRecording ? 'Stop & transcribe' : 'Start recording'}
            >
                {isTranscribing ? (
                    <span className="chat-input-row__mic-spinner" />
                ) : (
                    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <rect x="7" y="1" width="6" height="10" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                        <path d="M4 10a6 6 0 0 0 12 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        <line x1="10" y1="16" x2="10" y2="19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        <line x1="7"  y1="19" x2="13" y2="19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                )}
            </button>
            {isRecording && (
                <button
                    className="chat-input-row__mic-cancel"
                    onClick={onCancelMic}
                    title="Discard recording"
                >
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                        <line x1="5" y1="5" x2="15" y2="15"/>
                        <line x1="15" y1="5" x2="5" y2="15"/>
                    </svg>
                </button>
            )}
            <textarea
                ref={setTextarea}
                className="chat-input-row__textarea"
                value={value}
                onChange={onChange}
                onKeyDown={onKeyDown}
                placeholder={shownPlaceholder}
                rows={2}
                disabled={textareaDisabled}
            />
            {/* One primary button, three states:
                • streaming        → Stop
                • stopped + empty  → Play (resume the stopped reply in place)
                • otherwise        → Send (the moment there's text, Send wins) */}
            {isStreaming && onStop ? (
                <button
                    className="chat-input-row__send chat-input-row__stop"
                    onClick={onStop}
                    title="Stop response"
                    aria-label="Stop response"
                >
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <rect x="6" y="6" width="12" height="12" rx="2"/>
                    </svg>
                </button>
            ) : canResume && onResume && !value.trim() ? (
                <button
                    className="chat-input-row__send chat-input-row__resume"
                    onClick={onResume}
                    title="Resume response"
                    aria-label="Resume response"
                >
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        {/* bounding box centered on 12,12 so the triangle sits dead-center in the hover bg */}
                        <path d="M7 5v14l10-7z"/>
                    </svg>
                </button>
            ) : (
                <button
                    className="chat-input-row__send"
                    onClick={onSend}
                    disabled={sendDisabled}
                    title="Send"
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="22" y1="2" x2="11" y2="13"/>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                </button>
            )}
            {onClear && (
                <button
                    className="chat-input-row__clear"
                    onClick={onClear}
                    disabled={clearDisabled}
                    title={clearTitle}
                >
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                        <line x1="5" y1="5" x2="15" y2="15"/>
                        <line x1="15" y1="5" x2="5" y2="15"/>
                    </svg>
                </button>
            )}
        </div>
    )
}

// A trailing parenthetical that names the Enter key — the only kind of tail the panels append.
// Matched on `Enter` rather than "any trailing (…)" so a panel whose copy ends in a real
// parenthetical keeps it on every device.
const KEYBOARD_HINT = /\s*\([^)]*\bEnter\b[^)]*\)\s*$/i

// A phone/tablet, where the keyboard is a panel that eats half the screen rather than hardware.
// Read live (not once at module load) so a hybrid device that switches input mode answers for how
// it's being held right now. Same `pointer: coarse` signal the stylesheet uses to drop hover
// states — see the `hover-supported` mixin in _mixins.scss.
function isTouchPrimary() {
    return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
}

// Walks the ancestors rather than reading `offsetParent`, which is layout-dependent and always
// null under jsdom — this answers the same question in the browser and in a test.
function isVisible(el) {
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
        if (getComputedStyle(node).display === 'none') return false
    }
    return true
}

ChatInputRow.propTypes = {
    prefix:           PropTypes.string.isRequired,
    empty:            PropTypes.bool,
    textareaRef:      PropTypes.oneOfType([PropTypes.object, PropTypes.func]),
    value:            PropTypes.string.isRequired,
    onChange:         PropTypes.func.isRequired,
    onKeyDown:        PropTypes.func,
    placeholder:      PropTypes.string,
    onSend:           PropTypes.func.isRequired,
    sendDisabled:     PropTypes.bool,
    isStreaming:      PropTypes.bool,
    onStop:           PropTypes.func,
    canResume:        PropTypes.bool,
    onResume:         PropTypes.func,
    onClear:          PropTypes.func,
    clearDisabled:    PropTypes.bool,
    clearTitle:       PropTypes.string,
    onToggleMic:      PropTypes.func,
    onCancelMic:      PropTypes.func,
    isRecording:      PropTypes.bool,
    isTranscribing:   PropTypes.bool,
    micDisabled:      PropTypes.bool,
    textareaDisabled: PropTypes.bool,
}
