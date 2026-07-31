import PropTypes from 'prop-types'

// ── The row shell that carries actions ────────────────────────────────────────
//
// A row IS a <button> and a button cannot contain a button, so edit/delete/close ride in a SIBLING
// overlay pinned to the row's right edge rather than as two more cells inside it. That also keeps
// the row grid — which every Floor list shares — exactly as it was: nothing shifts when the controls
// appear, because they were never in the flow.
//
// Reveal is on hover OR focus-within (see Floor.scss): hover alone would strand the buttons for
// the keyboard, since they live inside the very row you have to reach to show them.
//
// Same split as everywhere else in the app — the shell is shared, the JUDGMENT isn't. WHICH
// actions a row offers, what they're called, and when they lock stays with the list that owns
// the entity, because only that list knows what acting on one of its rows would do.
//
// Lives in its own module rather than inside FloorLists so the shell stays available to any Floor
// list that grows actions. Today that is the right column's four desks (edit / delete) only — the
// left column's book carries NO controls by design: the Floor is for watching, and acting on a
// position happens in the Positions tab or the pop-out a row opens.
export function RowHost({ actions, children }) {
    return (
        <div className="floor-rowhost">
            {children}
            {actions && <span className="floor-rowhost__actions">{actions}</span>}
        </div>
    )
}

RowHost.propTypes = { actions: PropTypes.node, children: PropTypes.node }
