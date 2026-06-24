import { useTextPace, PACE_MIN, PACE_MAX } from '../customHooks/useTextPace.js'
import './PaceSlider.scss'

/**
 * Global text-streaming-speed knob. Reads/writes the shared useTextPace setting,
 * so every chat panel (and an in-progress reply) reflects a change immediately.
 */
// Perceived streaming speed is roughly logarithmic, so we drive the slider on a
// geometric scale: equal travel anywhere on the track = equal *percentage* speed
// change. This spreads the fine, useful slow range across the left instead of
// cramming it into the first few pixels, and gives the fast end real room too.
const POS_STEPS = 1000
const LN_MIN = Math.log(PACE_MIN)
const LN_SPAN = Math.log(PACE_MAX) - LN_MIN

const paceToPos = cps => Math.round(((Math.log(cps) - LN_MIN) / LN_SPAN) * POS_STEPS)
const posToPace = pos => Math.round(Math.exp(LN_MIN + (pos / POS_STEPS) * LN_SPAN))

export function PaceSlider() {
    const { paceCps, setPaceCps } = useTextPace()

    return (
        <label className="pace-slider" title={`Text speed — ${paceCps} chars/sec`}>
            <span className="pace-slider__cap">slow</span>
            <input
                className="pace-slider__range"
                type="range"
                min={0}
                max={POS_STEPS}
                step="1"
                value={paceToPos(paceCps)}
                onChange={e => setPaceCps(posToPace(Number(e.target.value)))}
                aria-label="Text streaming speed"
            />
            <span className="pace-slider__cap">fast</span>
        </label>
    )
}
