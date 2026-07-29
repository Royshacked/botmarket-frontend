import { useState } from 'react'
import PropTypes from 'prop-types'
import './CoverageActions.scss'

// The action row for one coverage, shared by every surface that lists the book (the Radar
// CoverageBook and the Floor's Coverage desk). SHARE THE SHELL, NOT THE CONTENT: the buttons, the
// confirm posture and the wording of a destructive act live here once; what each surface renders
// around them stays its own.
//
// Three actions, and the distinction between the last two is the whole point:
//   Edit    — reopen Prometheus on this name, in update mode. Revising a thesis is research, not
//             form-filling, so the pencil routes to the agent that wrote it (as the call/setup
//             pencils do) rather than to an inline field editor. Numbers keep coming from
//             compute_valuation instead of being typed over it.
//   Retire  — churn the name out of the book. Status change; the doc and its revision trail stay.
//   Delete  — remove the document permanently, trail and all. Two-step confirm, because the trail
//             is usually the most valuable thing on the doc and there is no undo.

export function CoverageActions({ coverage, onEdit, onRetire, onDelete }) {
    const [confirming, setConfirming] = useState(false)
    const stop = (fn) => (e) => { e.stopPropagation(); fn?.() }

    // The confirm REPLACES the buttons rather than opening a dialog: inline, dismissible by doing
    // nothing, and it names what is lost — the revision count is the only honest way to say it.
    //
    // Kept SHORT on purpose. On the Floor this row lives in an absolutely-positioned hover overlay
    // pinned to the row's right edge, so a full sentence would grow left across the column and clip.
    // The long form goes in the title, where there is room for it.
    if (confirming) {
        const revs = Array.isArray(coverage.revisions) ? coverage.revisions.length : 0
        const lost = revs > 0 ? ` + ${revs} revision${revs > 1 ? 's' : ''}` : ''
        return (
            <div className="coverage-actions coverage-actions--confirm" onClick={e => e.stopPropagation()}>
                <span
                    className="coverage-actions__warn"
                    title={`Deleting removes ${coverage.symbol} and its whole research history permanently. Retire instead to keep the trail.`}
                >
                    Delete {coverage.symbol}{lost}?
                </span>
                <button className="coverage-actions__btn coverage-actions__btn--danger" onClick={stop(() => { setConfirming(false); onDelete?.(coverage) })}>
                    Yes
                </button>
                <button className="coverage-actions__btn" onClick={stop(() => setConfirming(false))}>No</button>
            </div>
        )
    }

    return (
        <div className="coverage-actions" onClick={e => e.stopPropagation()}>
            {onEdit && (
                <button className="coverage-actions__btn" onClick={stop(() => onEdit(coverage))} title="Re-open Prometheus on this thesis">
                    Edit
                </button>
            )}
            {/* Already retired → the archive action has nothing left to do. Delete still does. */}
            {onRetire && coverage.status !== 'retired' && (
                <button className="coverage-actions__btn" onClick={stop(() => onRetire(coverage))} title="Churn out of the book — keeps the research and its history">
                    Retire
                </button>
            )}
            {onDelete && (
                <button className="coverage-actions__btn coverage-actions__btn--danger" onClick={stop(() => setConfirming(true))} title="Remove permanently, including the revision history">
                    Delete
                </button>
            )}
        </div>
    )
}

CoverageActions.propTypes = {
    coverage: PropTypes.object.isRequired,
    onEdit:   PropTypes.func,
    onRetire: PropTypes.func,
    onDelete: PropTypes.func,
}
