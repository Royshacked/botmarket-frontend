import { useEffect, useMemo, useRef } from 'react'
import PropTypes from 'prop-types'
import { PriceChart } from '../PriceChart/PriceChart.jsx'
import { deriveSetupOverlay } from '../TradeIdeas/chartOverlay.js'
import { watchTimeframe } from '../TradeIdeas/talosWatch.js'
import { openChart } from '../../services/chartSurface.service.js'
import './MentorTradeChart.scss'

// THE TRADE ON A CHART, IN THE CHAT, ONCE GENERATE LIGHTS (Roy, 2026-10-31: "the chart shouldn't cover the whole chat
// box, only a turn space"). The plan's own lines — entry, stop, targets, the validity edges — from the SAME overlay the
// setup's page draws (deriveSetupOverlay), on the timeframe it is watched on, so what the user checks before pressing is
// what they will see on the page after. The numbers are the worksheet's, never the model's prose.
//
// One chart, redrawn as the draft changes (a moved stop moves its line); it goes with the Generate bar. "Full chart"
// docks the workspace chart with the same lines, for a closer look.

export function MentorTradeChart({ setup }) {
    const { levels } = useMemo(() => deriveSetupOverlay(setup), [setup])
    const timeframe = watchTimeframe(setup)
    const ticker = setup?.asset ?? ''
    const ref = useRef(null)
    // Into view once, when it appears — it lands at the end of the thread, under the turn that finished the plan.
    useEffect(() => { ref.current?.scrollIntoView?.({ block: 'nearest' }) }, [])

    if (!ticker || levels.length === 0) return null
    return (
        <div className="chat-timeline__row chat-timeline__row--assistant mentor-trade-chart" ref={ref}>
            <div className="mentor-trade-chart__frame">
                <PriceChart key={`${ticker}-${timeframe}`} symbol={ticker} interval={timeframe} levels={levels} />
            </div>
            <div className="mentor-trade-chart__foot">
                <span className="mentor-trade-chart__note">The plan as it will be generated.</span>
                <button
                    type="button"
                    className="mentor-trade-chart__open"
                    onClick={() => openChart({ ticker, timeframe, levels, source: 'mentor' })}
                >
                    Full chart
                </button>
            </div>
        </div>
    )
}

MentorTradeChart.propTypes = {
    setup: PropTypes.object,
}
