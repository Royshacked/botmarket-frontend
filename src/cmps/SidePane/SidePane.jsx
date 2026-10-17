import { useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import { DrawerShell } from '../DrawerShell/DrawerShell.jsx'
import { isHandheld } from '../EntityCard/entityPopup.js'
import { agentMeta } from '../ChatTimeline/timelineRows.js'
import { closePane, closeSurface, openSurface, setPinned, showSurface, useSidePane } from './sidePane.store.js'
import './SidePane.scss'

// ── The side pane: each desk's working surface, beside the chat (unified-chat plan phase 8b, K5) ──
//
// The conversation is the timeline; the WORK — Mentor's worksheet and gates, Atlas's plan, Argus's list — is drawn
// here, from the desk's state on the session (agentState), never from a reply. One tab per desk opened, and it
// follows the floor: the desk that takes it comes up (a pinned tab is not taken over). The floor going back to Axl
// leaves the pane as it is — closing it would hide a half-built plan every time the user asks Axl something.
//
// WHERE IT LANDS: on a desktop it sits beside the timeline in the chat column, which narrows to make room — the
// conversation stays readable and the input stays reachable. On a handheld it is a bottom sheet over the app, and the
// phone's back gesture closes it. Esc closes it either way (DrawerShell — the top drawer only).

/**
 * @param {{ session: object, surfaces: Record<string, Function>, deskProps?: object }} props
 *   surfaces  the desks that have one, by agent key → the component (it gets `session` and `deskProps`)
 */
export function SidePane({ session, surfaces, deskProps = {} }) {
    const { tabs, active, pinned } = useSidePane()
    const floor = session?.floor ?? 'axl'

    // Follow the floor. Keyed on the floor's CHANGE, not its value, so closing the pane while a desk holds the floor
    // keeps it closed until the floor moves again.
    const lastFloor = useRef(null)
    useEffect(() => {
        if (floor === lastFloor.current) return
        lastFloor.current = floor
        if (surfaces[floor]) openSurface(floor, { follow: true })
    }, [floor, surfaces])

    const shown = tabs.filter(t => surfaces[t])
    const current = shown.includes(active) ? active : null
    const Surface = current ? surfaces[current] : null
    const handheld = !!Surface && isHandheld()

    return (
        <DrawerShell
            isOpen={!!Surface}
            onClose={closePane}
            portalTo={handheld ? document.body : null}
            label={current ? `${agentMeta(current).brand}'s work` : 'Desk'}
            className={`side-pane side-pane--${handheld ? 'sheet' : 'docked'}`}
            modal={handheld}
            history={handheld ? { field: 'sidePane', key: 'pane' } : null}
        >
            <header className="side-pane__head">
                <div className="side-pane__tabs" role="tablist" aria-label="Desks">
                    {shown.map(t => (
                        <span key={t} className={`side-pane__tab${t === current ? ' is-active' : ''}`}>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={t === current}
                                className="side-pane__tab-btn"
                                onClick={() => showSurface(t)}
                            >
                                {agentMeta(t).brand}
                            </button>
                            <button type="button" className="side-pane__tab-close" onClick={() => closeSurface(t)} aria-label={`Close ${agentMeta(t).brand}`}>
                                ×
                            </button>
                        </span>
                    ))}
                </div>
                <button
                    type="button"
                    className={`side-pane__pin${pinned ? ' is-on' : ''}`}
                    onClick={() => setPinned(!pinned)}
                    aria-pressed={pinned}
                    title={pinned ? 'Unpin — follow whoever is talking' : 'Pin — keep this desk showing'}
                >
                    {pinned ? 'Pinned' : 'Pin'}
                </button>
                <button type="button" className="side-pane__close" onClick={closePane} aria-label="Close" title="Close (Esc)">✕</button>
            </header>
            <div className="side-pane__body" role="tabpanel">
                {Surface && <Surface session={session} deskProps={deskProps} />}
            </div>
        </DrawerShell>
    )
}

SidePane.propTypes = {
    session:   PropTypes.object,
    surfaces:  PropTypes.object.isRequired,
    deskProps: PropTypes.object,
}
