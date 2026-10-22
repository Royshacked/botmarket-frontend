import { useEffect, useLayoutEffect } from 'react'
import PropTypes from 'prop-types'
import { DetailPanelSlot } from '../DetailPanel/DetailPanel.jsx'
import { useActivePanel } from '../DetailPanel/detailPanel.store.js'
import { SidePane } from '../SidePane/SidePane.jsx'
import { useSidePane } from '../SidePane/sidePane.store.js'
import { useChartSurface } from '../../customHooks/useChartSurface.js'
import { ChartSurface } from '../PriceChart/ChartSurface.jsx'
import { isHandheld } from '../EntityCard/entityPopup.js'
import { bringToFront, setStaged, setVisible, topChannel, useStage } from './stage.store.js'
import './Stage.scss'

// ── THE STAGE — the right half of the chat column on the Floor (docs/design/floor-stage.md) ──
//
// The chat on the left, and here whatever the user is looking at: a list (and an item opened from it), a desk's
// working surface, or the chart (Roy, 2026-10-22). One at a time, by RECENCY: whatever opened last covers the rest,
// and closing it shows what was under it. Each channel keeps its own state — the panel store, the side pane's, the
// chart surface — and every layer stays MOUNTED while covered (a list renders its items' panels, a surface holds
// half-typed work, the chart its zoom); only the one on top is shown.
//
// On a handheld there is no stage on screen: a panel is a page, the pane a sheet (both portal to <body>), and the
// chart docks in the chat as before — so the stage decides nothing there (`setVisible(null)`).

export function Stage({ session, surfaces, deskProps = {} }) {
    const activePanel = useActivePanel()
    const { tabs, active } = useSidePane()
    const surface = tabs.includes(active) && surfaces[active] ? active : null
    const { chart, close: closeChart } = useChartSurface()
    const { order } = useStage()

    // Whatever opens comes to the front. Keyed on the CHANGE: a list opened while Mentor shows covers Mentor; Mentor
    // taking the floor again covers the list. A chart request is a new object each time — re-asking re-fronts it.
    useEffect(() => { if (activePanel) bringToFront('panel') }, [activePanel])
    useEffect(() => { if (surface) bringToFront('surface') }, [surface])
    useEffect(() => { if (chart) bringToFront('chart') }, [chart])

    const top = topChannel(order, { panel: !!activePanel, surface: !!surface, chart: !!chart })
    useLayoutEffect(() => { setVisible(isHandheld() ? null : top) }, [top])
    useLayoutEffect(() => {
        setStaged(!isHandheld())
        return () => { setVisible(null); setStaged(false) }
    }, [])

    // Esc closes the chart when it is on top, like every other layer (the panel's and the pane's drawers stand aside
    // while covered — DrawerShell). Unless something already handled it.
    useEffect(() => {
        if (top !== 'chart') return undefined
        const onKey = (e) => {
            if (e.key !== 'Escape' || e.defaultPrevented) return
            e.preventDefault()
            closeChart()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [top, closeChart])

    return (
        <section className={`stage stage--${top ?? 'empty'}`} aria-label="Stage">
            <div className="stage__layer stage__layer--panel"><DetailPanelSlot /></div>
            <div className="stage__layer stage__layer--surface">
                <SidePane session={session} surfaces={surfaces} deskProps={deskProps} />
            </div>
            <div className="stage__layer stage__layer--chart">
                {chart && (
                    <ChartSurface ticker={chart.ticker} timeframe={chart.timeframe} drawings={chart.drawings ?? []} onClose={closeChart} />
                )}
            </div>
            {!top && (
                <div className="stage__empty">
                    {/* The default is Roy's to choose (floor-stage.md) — until then, where things come from. */}
                    <p>Open a list from the strip, ask Axl, or ask any desk for a chart — it shows here.</p>
                </div>
            )}
        </section>
    )
}

Stage.propTypes = {
    session:   PropTypes.object,
    surfaces:  PropTypes.object.isRequired,
    deskProps: PropTypes.object,
}
