import PropTypes from 'prop-types'
import { agentMeta } from '../ChatTimeline/timelineRows.js'
import { closePane, reopenPane, useSidePane } from './sidePane.store.js'

/**
 * The chat header's way back to the side pane (Roy, 2026-10-18: closing it left no way to reopen it — it only came
 * back when ANOTHER desk took the floor). Open → "Hide …"; closed → "Show …" for what it was closed over, or the desk
 * holding the floor. Nothing to show (Axl's floor, nothing hidden) → no button.
 *
 * @param {{ floor?: string|null, surfaces: Record<string, Function> }} props
 *   surfaces  the desks that have a pane surface (MainPage's SURFACES) — a key without one never offers a button
 */
export function PaneToggle({ floor = null, surfaces }) {
    const { tabs, active, hidden } = useSidePane()
    const nameOf = (t) => surfaces[t]?.paneLabel ?? `${agentMeta(t).brand}'s work`
    const open = tabs.some(t => surfaces[t])
    const floorDesk = floor && floor !== 'axl' && surfaces[floor] ? floor : null
    const target = open ? active : (hidden?.active && surfaces[hidden.active] ? hidden.active : floorDesk)
    if (!target) return null

    return (
        <button
            type="button"
            className={`chat-timeline__action chat-timeline__pane-toggle${open ? ' is-open' : ''}`}
            aria-expanded={open}
            onClick={() => (open ? closePane() : reopenPane(floorDesk))}
            title={open ? 'Hide the side pane — the chat keeps the whole column' : 'Show the side pane beside the chat'}
        >
            {open ? `Hide ${nameOf(target)}` : `Show ${nameOf(target)}`}
        </button>
    )
}

PaneToggle.propTypes = {
    floor:    PropTypes.string,
    surfaces: PropTypes.object.isRequired,
}
