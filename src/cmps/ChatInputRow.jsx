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
                ref={textareaRef}
                className="chat-input-row__textarea"
                value={value}
                onChange={onChange}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
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

ChatInputRow.propTypes = {
    prefix:           PropTypes.string.isRequired,
    empty:            PropTypes.bool,
    textareaRef:      PropTypes.object,
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
