import PropTypes from 'prop-types'

// Throw away a desk's UNSAVED work — the old panels' Clear, on the surfaces (phase 8e). Asked first: nothing of it is
// saved anywhere. The press is the session's `discard` (backend act.js), which also sets its turns aside so they never
// seal onto what the desk builds next. A saved item being edited is left with Later instead.

export function DiscardButton({ what = 'this', onDiscard, disabled = false }) {
    return (
        <button
            type="button"
            className="portfolio-panel__review-btn portfolio-panel__review-btn--dismiss desk-surface__discard"
            onClick={() => { if (window.confirm(`Discard ${what}? It is not saved anywhere.`)) onDiscard() }}
            disabled={disabled}
            title="Throw this away — nothing is saved"
        >
            Discard
        </button>
    )
}

DiscardButton.propTypes = {
    what:      PropTypes.string,
    onDiscard: PropTypes.func.isRequired,
    disabled:  PropTypes.bool,
}
