import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import PropTypes from 'prop-types'
import { DrawerShell } from '../DrawerShell/DrawerShell.jsx'
import { isHandheld } from '../EntityCard/entityPopup.js'
import { agentMeta } from '../ChatTimeline/timelineRows.js'
import { closePane, closeSurface, collapsePane, openSurface, showSurface, sidePaneState, useSidePane } from './sidePane.store.js'
import './SidePane.scss'
import { paneName, paneTooltip } from './paneTitle.js'
import { buildWords, lastStep, buildKeys, buildChanges } from './buildStatus.js'
import { toolStatusLabel } from '../../services/toolStatusLabels.js'
import { showUserMsg } from '../../services/event-bus.service.js'

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

// KEPT SURFACES (phase 8e). Pythia's panel keeps its own conversation (it is not on the session yet),
// and the order ticket a half-typed order: unmounted, either is lost. A surface marked `keepMounted` is rendered ONCE,
// into a host node of its own, through a portal — the node is moved into the pane while its tab shows and out of it
// otherwise, so the component under it never unmounts while the pane hides, closes or switches tabs (only closing its
// own tab ends it). `paneLabel` names a tab that is not an agent's (the ticket). `paneHint` is the one line under the
// tabs that says what the pane holds and how it is saved (Roy, 2026-10-19: the pane was not clear to a user).

/** Moves a kept surface's host node into the pane while it is the one showing. */
function KeptSlot({ host }) {
    const ref = useRef(null)
    // Before paint: attached in a plain effect, the pane showed empty for a frame (8e CR).
    useLayoutEffect(() => {
        const slot = ref.current
        slot?.appendChild(host)
        return () => { if (host.parentNode === slot) slot.removeChild(host) }
    }, [host])
    return <div ref={ref} className="side-pane__kept-slot" />
}
KeptSlot.propTypes = { host: PropTypes.object.isRequired }

/**
 * @param {{ session: object, surfaces: Record<string, Function>, deskProps?: object }} props
 *   surfaces  the desks that have one, by agent key → the component (it gets `session` and `deskProps`); a component
 *             may carry `keepMounted` and `paneLabel` (above)
 */
export function SidePane({ session, surfaces, deskProps = {} }) {
    const { tabs, active, parked, collapsed } = useSidePane()
    const hosts = useRef(new Map())
    const hostFor = (t) => {
        if (!hosts.current.has(t)) {
            const node = document.createElement('div')
            node.className = 'side-pane__kept'
            hosts.current.set(t, node)
        }
        return hosts.current.get(t)
    }
    // The tab names the BUILDER — Trader / Portfolio / Analyst (style session 2026-11-20; it named the item before,
    // one-axl.md §5) — and the item on it is the tooltip.
    const ownLabel = (t) => surfaces[t]?.paneLabel ?? agentMeta(t).work
    const labelOf = (t) => paneName(t, ownLabel(t))
    const tipOf = (t) => paneTooltip(t, session?.agentState?.[t], ownLabel(t))
    const floor = session?.floor ?? 'axl'

    // Follow the floor. Keyed on the floor's CHANGE, not its value, so closing the pane while a desk holds the floor
    // keeps it closed until the floor moves again.
    // ON A PHONE the desk opens with its sheet DOWN (Roy, 2026-10-28): coming up on its own, the sheet covered the reply
    // the user was reading. The desk is open all the same — its buttons sit under the chat (ChatActions) and the
    // header's toggle carries a dot.
    const lastFloor = useRef(null)
    useEffect(() => {
        if (floor === lastFloor.current) return
        const left = lastFloor.current
        lastFloor.current = floor
        // A desk that keeps nothing once its work is handed on closes when the floor moves to the desk it hands to (the
        // stock picker → the trader). Anywhere else — a question to Axl mid-search — it stays, as every tab does; a pinned
        // one always stays (CR 2026-11-18).
        const pane = sidePaneState()
        const pinnedHere = pane.pinned && pane.active === left
        if (left && surfaces[left]?.leavesWithFloor === floor && !pinnedHere) closeSurface(left)
        if (surfaces[floor]) openSurface(floor, { follow: true, collapse: isHandheld() })
    }, [floor, surfaces])

    // A BUILD IN THE BACKGROUND (step 5b): its desk opens when it starts — the chat stays with Axl, so following the floor
    // alone would never show it — and a ready one is announced once (M13). Not on the first load: a reload is no news.
    const lastBuilds = useRef(null)
    const builds = buildKeys(session?.agentState)
    const buildsKey = JSON.stringify(builds)
    useEffect(() => {
        const prev = lastBuilds.current
        lastBuilds.current = builds
        if (!prev) return
        const { started, ready } = buildChanges(prev, builds, session?.agentState)
        for (const a of started) if (surfaces[a]) openSurface(a, { follow: true, collapse: isHandheld() })
        for (const a of ready) {
            if (surfaces[a]) openSurface(a, { follow: true, collapse: isHandheld() })
            showUserMsg({ txt: `${session.agentState[a].build.title} is ready — review it in the pane, then Generate.`, type: 'success' })
        }
    }, [buildsKey, surfaces]) // eslint-disable-line react-hooks/exhaustive-deps

    // A NEW SESSION (a commit ended the last one — Roy, 2026-10-18 — or New session) starts back with Axl: the desks'
    // tabs held the old session's work, so they close. A kept surface (Pythia, the ticket) is not session work
    // and stays. Not on the first load — there is nothing open yet to close.
    const lastSession = useRef(session?.sessionId ?? null)
    useEffect(() => {
        const id = session?.sessionId ?? null
        const was = lastSession.current
        lastSession.current = id
        if (!was || !id || was === id) return
        for (const t of sidePaneState().tabs) if (!surfaces[t]?.keepMounted) closeSurface(t)
    }, [session?.sessionId, surfaces])

    const shown = tabs.filter(t => surfaces[t])
    const current = shown.includes(active) ? active : null
    const Surface = current ? surfaces[current] : null
    const handheld = !!Surface && isHandheld()
    const kept = [...new Set([...shown, ...(parked ?? [])])].filter(t => surfaces[t]?.keepMounted)
    // A phone's desk surface is mounted into its own host node too, like a kept one: it must stay mounted while its sheet
    // is down — its buttons are under the chat, its half-typed edit is still its own. The sheet up, KeptSlot moves the
    // node in. Down (✕, back, Esc) LOWERS it: the desk stays open; closing its tab is "done with it".
    const deskHost = handheld && !Surface.keepMounted ? hostFor(`desk:${current}`) : null
    const sheetUp = !!Surface && !(handheld && collapsed)
    const lower = handheld ? collapsePane : closePane

    return (
        <>
        {/* The kept surfaces, each mounted once into its own host node (moved into the pane by KeptSlot). */}
        {kept.map(t => {
            const Kept = surfaces[t]
            return createPortal(<Kept session={session} deskProps={deskProps} />, hostFor(t), `kept-${t}`)
        })}
        {deskHost && createPortal(<Surface key={session?.sessionId ?? 'none'} session={session} deskProps={deskProps} />, deskHost, `desk-${current}`)}
        <DrawerShell
            isOpen={sheetUp}
            onClose={lower}
            portalTo={handheld ? document.body : null}
            label={current ? labelOf(current) : 'Work'}
            className={`side-pane side-pane--${handheld ? 'sheet' : 'docked'}`}
            modal={handheld}
            // Docked, it opens beside the chat — often on its own, as the floor moves — so focus stays in the input.
            autoFocus={handheld}
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
                                title={tipOf(t)}
                            >
                                {labelOf(t)}
                            </button>
                            <button type="button" className="side-pane__tab-close" onClick={() => closeSurface(t)} aria-label={`Close ${labelOf(t)}`}>
                                ×
                            </button>
                        </span>
                    ))}
                </div>
                <button type="button" className="side-pane__close" onClick={lower} aria-label="Close" title="Close (Esc)">✕</button>
            </header>
            {/* What this pane is — the surface says it (`paneHint`); a kept surface with its own screen has none. */}
            {Surface?.paneHint && <p className="side-pane__hint">{Surface.paneHint}</p>}
            {current && <BuildStrip agent={current} session={session} />}
            <div className="side-pane__body" role="tabpanel">
                {/* Keyed on the session: a surface's half-typed edit belongs to the session it was typed in. */}
                {Surface && (Surface.keepMounted
                    ? <KeptSlot host={hostFor(current)} />
                    : deskHost
                        ? <KeptSlot host={deskHost} />
                        : <Surface key={session?.sessionId ?? 'none'} session={session} deskProps={deskProps} />)}
            </div>
        </DrawerShell>
        </>
    )
}

/** The build on this desk, if any: its status, what it is doing now, its latest step (step 5b). */
function BuildStrip({ agent, session }) {
    const build = session?.agentState?.[agent]?.build
    const words = buildWords(agent, build)
    if (!words) return null
    const bg = session?.background?.agent === agent ? session.background : null
    const doing = build.status === 'building' && bg?.tool ? toolStatusLabel(bg.tool, bg.targets) : null
    const step = build.status === 'building' || build.status === 'ready' ? lastStep(session?.rows, agent, build) : null
    return (
        <div className={`side-pane__build side-pane__build--${build.status}`} role="status">
            <p className="side-pane__build-status">{words}</p>
            {doing && <p className="side-pane__build-doing">{doing}</p>}
            {step && <p className="side-pane__build-step">{step}</p>}
        </div>
    )
}
BuildStrip.propTypes = { agent: PropTypes.string.isRequired, session: PropTypes.object }

SidePane.propTypes = {
    session:   PropTypes.object,
    surfaces:  PropTypes.object.isRequired,
    deskProps: PropTypes.object,
}
