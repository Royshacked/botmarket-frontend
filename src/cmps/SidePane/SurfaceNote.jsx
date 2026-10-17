import PropTypes from 'prop-types'

// What a press on a side-pane surface did, or why it did not (useSurfacePress's note) — one line, said the same way on
// every desk (phase 8d CR). An error is an alert; anything else is a status.

export function SurfaceNote({ note }) {
    if (!note?.text) return null
    const kind = note.kind === 'error' ? 'error' : 'done'
    return <p className={`desk-surface__note desk-surface__note--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{note.text}</p>
}

SurfaceNote.propTypes = {
    note: PropTypes.shape({ kind: PropTypes.string, text: PropTypes.string }),
}
