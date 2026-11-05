import { useEffect, useMemo, useRef } from 'react'
import PropTypes from 'prop-types'
import { PriceChart } from '../PriceChart/PriceChart.jsx'
import { deriveSetupOverlay } from '../TradeIdeas/chartOverlay.js'
import { watchTimeframe } from '../TradeIdeas/talosWatch.js'
import { openChart, currentChart } from '../../services/chartSurface.service.js'
import './MentorTradeChart.scss'

// THE TRADE ON A CHART, IN THE CHAT, ONCE IT HAS A STOP AND A TARGET (2026-11-05; Roy, 2026-10-31: "the chart shouldn't cover the whole chat
// box, only a turn space"). The plan's own lines — entry, stop, targets, the validity edges — from the SAME overlay the
// setup's page draws (deriveSetupOverlay), on the timeframe it is watched on, so what the user checks before pressing is
// what they will see on the page after. The numbers are the worksheet's, never the model's prose.
//
// One chart, redrawn as the draft changes (a moved stop moves its line); it goes with the Generate bar. It is small in
// every measure — box, text, volume pane (Roy, 2026-11-03: a short wide chart made everything look big). "Full chart"
// docks the workspace chart with the same lines; its "Shrink" closes the dock, back to this one.

// Zoomed out to the whole picture (Roy, 2026-11-03): the last 120 bars — the window the thesis lens reads its structure
// in (STRUCTURE.atHighs, botmarket-backend services/swingStructure.service.js), so the fall, the swings and the lines show.
const FIT_BARS = 120

/** Is the end of the scrolling thread in sight, allowing for this element, which has just grown it? */
function nearThreadEnd(el) {
    for (let box = el?.parentElement; box; box = box.parentElement) {
        if (!/auto|scroll/.test(getComputedStyle(box).overflowY)) continue
        return box.scrollHeight - box.scrollTop - box.clientHeight <= el.offsetHeight + 120
    }
    return true
}

export function MentorTradeChart({ setup, ready = true }) {
    const { levels } = useMemo(() => deriveSetupOverlay(setup), [setup])
    const timeframe = watchTimeframe(setup)
    const ticker = setup?.asset ?? ''
    const ref = useRef(null)
    // Into view when it appears, at the end of the thread — unless the user has scrolled up to read: it comes back at the
    // end of every turn of a build now, and useChatScroll leaves them where they are (code review).
    useEffect(() => { if (nearThreadEnd(ref.current)) ref.current?.scrollIntoView?.({ block: 'nearest' }) }, [])

    // The chart now opens mid-build, so the lines can move while "Full chart" is docked: the dock follows them (CR).
    const levelsKey = JSON.stringify(levels)
    useEffect(() => {
        const docked = currentChart()
        if (docked?.source === 'mentor-trade' && docked.ticker === ticker) openChart({ ticker, timeframe, levels, fitBars: FIT_BARS, source: 'mentor-trade' })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [levelsKey])

    if (!ticker || levels.length === 0) return null
    return (
        <div className="chat-timeline__row chat-timeline__row--assistant mentor-trade-chart" ref={ref}>
            <div className="mentor-trade-chart__frame">
                <PriceChart key={`${ticker}-${timeframe}`} symbol={ticker} interval={timeframe} levels={levels} compact fitBars={FIT_BARS} />
            </div>
            <div className="mentor-trade-chart__foot">
                <span className="mentor-trade-chart__note">{ready ? 'The plan as it will be generated.' : 'The levels so far.'}</span>
                <button
                    type="button"
                    className="mentor-trade-chart__open"
                    onClick={() => openChart({ ticker, timeframe, levels, fitBars: FIT_BARS, source: 'mentor-trade' })}
                >
                    Full chart
                </button>
            </div>
        </div>
    )
}

MentorTradeChart.propTypes = {
    ready: PropTypes.bool,
    setup: PropTypes.object,
}
