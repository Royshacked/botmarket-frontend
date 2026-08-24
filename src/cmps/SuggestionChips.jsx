import PropTypes from 'prop-types'
import './SuggestionChips.scss'

/**
 * Follow-up chips: what the user might ask next, one click away.
 *
 * SHARED SHELL, like ChatInputRow — Axl is the only caller today, but nothing here knows that. An
 * agent that starts emitting `<suggest>` gets the same row for free (backend:
 * services/suggestions.service.js). What to suggest is the agent's own judgment and lives in its
 * prompt; this only lays them out.
 *
 * BELOW THE THREAD, not under a bubble. They belong to the latest turn only: chips hanging under
 * every historical message would be a wall of stale questions, and the one place a reader looks
 * for "what now" is the bottom. Same reasoning that already puts the waiting mark there.
 *
 * A chip sends its own text as the user's next message — so the prompt writes them in the user's
 * voice ("Why is MU down?"), never the agent's ("Would you like me to explain…").
 *
 * A chip may instead be `{ label, onPick }`, for the one that does not say anything: Mentor's "I
 * already have the exact setup" opens a form rather than sending a turn. It is an OPENING MOVE the
 * same as the others — the user choosing how to start — so it belongs in the same row and wearing
 * the same clothes, not as a differently-shaped button underneath. `action: true` marks it for the
 * one styling difference that is honest: it goes somewhere instead of saying something.
 *
 * `variant` is the same escape hatch ChatInputRow's `prefix` is: a root modifier
 * (`suggestion-chips--<variant>`) a caller can style against, so a surface with its own needs — Axl's
 * landing screen, where the chips sit under a centred greeting rather than under a reply — tweaks the
 * row from its OWN stylesheet. Nothing here learns who is calling.
 */
export function SuggestionChips({ suggestions = [], onPick, disabled = false, variant }) {
    if (!suggestions.length) return null

    return (
        <div
            className={`suggestion-chips${variant ? ` suggestion-chips--${variant}` : ''}`}
            role="group"
            aria-label="Suggested follow-ups"
        >
            {suggestions.map((s, i) => {
                // A plain string is the ordinary case and behaves exactly as it always has.
                const label  = typeof s === 'string' ? s : s?.label
                const action = typeof s === 'string' ? null : s?.onPick
                if (!label) return null

                return (
                    <button
                        key={i}
                        type="button"
                        className={`suggestion-chips__chip${typeof s !== 'string' && s?.action ? ' is-action' : ''}`}
                        title={typeof s === 'string' ? undefined : s?.title}
                        onClick={() => (action ? action() : onPick?.(label))}
                        disabled={disabled}
                    >{label}</button>
                )
            })}
        </div>
    )
}

SuggestionChips.propTypes = {
    suggestions: PropTypes.arrayOf(PropTypes.oneOfType([
        PropTypes.string,
        // A chip that does something instead of saying something.
        PropTypes.shape({
            label:  PropTypes.string.isRequired,
            onPick: PropTypes.func.isRequired,
            title:  PropTypes.string,
            action: PropTypes.bool,
        }),
    ])),
    onPick:      PropTypes.func,
    disabled:    PropTypes.bool,
    variant:     PropTypes.string,
}
