import { useTextPace, PACE_MIN, PACE_MAX } from '../customHooks/useTextPace.js'
import './PaceSlider.scss'

/**
 * Global text-streaming-speed knob. Reads/writes the shared useTextPace setting,
 * so every chat panel (and an in-progress reply) reflects a change immediately.
 */
export function PaceSlider() {
    const { paceCps, setPaceCps } = useTextPace()

    return (
        <label className="pace-slider" title={`Text speed — ${paceCps} chars/sec`}>
            <span className="pace-slider__cap">slow</span>
            <input
                className="pace-slider__range"
                type="range"
                min={PACE_MIN}
                max={PACE_MAX}
                step="1"
                value={paceCps}
                onChange={e => setPaceCps(Number(e.target.value))}
                aria-label="Text streaming speed"
            />
            <span className="pace-slider__cap">fast</span>
        </label>
    )
}
