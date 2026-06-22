import PropTypes from 'prop-types'

/**
 * Shared chat input row: mic toggle, textarea, send, and clear.
 *
 * Class names are derived from `prefix` (e.g. 'chat-panel' / 'portfolio-panel')
 * so each panel's existing SCSS applies unchanged. All disabled/visibility logic
 * is decided by the parent and passed in.
 */
export function ChatInputRow({
    prefix,
    textareaRef,
    value,
    onChange,
    onKeyDown,
    placeholder,
    onSend,
    sendDisabled,
    isStreaming,
    onStop,
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
        <div className={`${prefix}__input-row`}>
            <button
                className={`${prefix}__mic ${isRecording ? 'recording' : ''} ${isTranscribing ? 'transcribing' : ''}`}
                onClick={onToggleMic}
                disabled={micDisabled}
                title={isRecording ? 'Stop & transcribe' : 'Start recording'}
            >
                {isTranscribing ? (
                    <span className={`${prefix}__mic-spinner`} />
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
                    className={`${prefix}__mic-cancel`}
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
                className={`${prefix}__textarea`}
                value={value}
                onChange={onChange}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                rows={2}
                disabled={textareaDisabled}
            />
            {isStreaming && onStop ? (
                <button
                    className={`${prefix}__send ${prefix}__stop`}
                    onClick={onStop}
                    title="Stop response"
                    aria-label="Stop response"
                >
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <rect x="6" y="6" width="12" height="12" rx="2"/>
                    </svg>
                </button>
            ) : (
                <button
                    className={`${prefix}__send`}
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
            <button
                className={`${prefix}__clear`}
                onClick={onClear}
                disabled={clearDisabled}
                title={clearTitle}
            >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <line x1="5" y1="5" x2="15" y2="15"/>
                    <line x1="15" y1="5" x2="5" y2="15"/>
                </svg>
            </button>
        </div>
    )
}

ChatInputRow.propTypes = {
    prefix:           PropTypes.string.isRequired,
    textareaRef:      PropTypes.object,
    value:            PropTypes.string.isRequired,
    onChange:         PropTypes.func.isRequired,
    onKeyDown:        PropTypes.func,
    placeholder:      PropTypes.string,
    onSend:           PropTypes.func.isRequired,
    sendDisabled:     PropTypes.bool,
    isStreaming:      PropTypes.bool,
    onStop:           PropTypes.func,
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
