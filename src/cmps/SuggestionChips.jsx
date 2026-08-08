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
 */
export function SuggestionChips({ suggestions = [], onPick, disabled = false }) {
    if (!suggestions.length) return null

    return (
        <div className="suggestion-chips" role="group" aria-label="Suggested follow-ups">
            {suggestions.map((text, i) => (
                <button
                    key={i}
                    type="button"
                    className="suggestion-chips__chip"
                    onClick={() => onPick?.(text)}
                    disabled={disabled}
                >{text}</button>
            ))}
        </div>
    )
}

SuggestionChips.propTypes = {
    suggestions: PropTypes.arrayOf(PropTypes.string),
    onPick:      PropTypes.func,
    disabled:    PropTypes.bool,
}
