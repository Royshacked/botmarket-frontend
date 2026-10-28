import PropTypes from 'prop-types'
import { agentMeta } from '../ChatTimeline/timelineRows.js'
import { closePane, collapsePane, expandPane, reopenPane, useSidePane } from './sidePane.store.js'
import { isHandheld } from '../EntityCard/entityPopup.js'

/**
 * The chat header's way back to the side pane (Roy, 2026-10-18: closing it left no way to reopen it — it only came
 * back when ANOTHER desk took the floor). Open → "Hide …"; closed → "Show …" for what it was closed over, or the desk
 * holding the floor. Nothing to show (Axl's floor, nothing hidden) → no button.
 *
 * @param {{ floor?: string|null, surfaces: Record<string, Function> }} props
 *   surfaces  the desks that have a pane surface (MainPage's SURFACES) — a key without one never offers a button
 */
export function PaneToggle({ floor = null, surfaces }) {
    const { tabs, active, hidden, collapsed } = useSidePane()
    const nameOf = (t) => surfaces[t]?.paneLabel ?? `${agentMeta(t).brand}'s work`
    const anyTab = tabs.some(t => surfaces[t])
    // A phone's lowered sheet (2026-10-28): the desk is open, its sheet down — "Show", with a dot: there is work in it.
    const lowered = anyTab && collapsed
    const open = anyTab && !collapsed
    const floorDesk = floor && floor !== 'axl' && surfaces[floor] ? floor : null
    const target = anyTab ? active : (hidden?.active && surfaces[hidden.active] ? hidden.active : floorDesk)
    if (!target) return null
    const handheld = isHandheld()

    return (
        <button
            type="button"
            className={`chat-timeline__action chat-timeline__pane-toggle${open ? ' is-open' : ''}${lowered ? ' has-work' : ''}`}
            aria-expanded={open}
            onClick={() => (open ? (handheld ? collapsePane() : closePane()) : lowered ? expandPane() : reopenPane(floorDesk))}
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
