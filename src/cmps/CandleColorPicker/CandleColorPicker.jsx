import { useState } from 'react'
import {
    loadCandleColors, defaultCandleColors, saveCandleColor, clearCandleColors,
    candleHexFromSliders, slidersFromHex, candleShadeTrack,
} from '../../services/candleColors.service'
import { queuePrefSync } from '../../services/preferences.service'
import './CandleColorPicker.scss'

// Up / down candle colour picker for the price chart, on the accent picker's two knobs per side:
// hue (the colour, full wheel) and shade (deep ↔ light). The sliders start where the theme
// default sits; until the user moves one, no override is applied and the swatch shows the
// default hollow. Applies live (inline vars on <html> + an event the mounted chart listens for)
// and syncs the choice to the account like the rest of the appearance preferences.
const SIDES = [['up', 'Up'], ['down', 'Down']]

export function CandleColorPicker() {
    // Slider positions per side, seeded from the saved override or, failing that, the theme
    // default — so an untouched slider sits on the colour the chart is actually painting.
    const [sliders, setSliders] = useState(() => {
        const saved = loadCandleColors(), base = defaultCandleColors()
        return {
            up:   slidersFromHex(saved.up   ?? base.up),
            down: slidersFromHex(saved.down ?? base.down),
        }
    })
    const [saved, setSaved] = useState(loadCandleColors)
    const active = saved.up !== null || saved.down !== null

    function move(side, hue, shade) {
        setSliders(prev => ({ ...prev, [side]: { hue, shade } }))
        saveCandleColor(side, candleHexFromSliders(hue, shade))
        setSaved(loadCandleColors())
        queuePrefSync()
    }

    function reset() {
        clearCandleColors()
        const base = defaultCandleColors()
        setSliders({ up: slidersFromHex(base.up), down: slidersFromHex(base.down) })
        setSaved(loadCandleColors())
        queuePrefSync()
    }

    return (
        <div className="candle-colors">
            {SIDES.map(([side, label]) => {
                const { hue, shade } = sliders[side]
                const isSet = saved[side] !== null
                return (
                    <div key={side} className="candle-colors__side">
                        <div className="candle-colors__row">
                            <input
                                type="range"
                                min="0"
                                max="360"
                                value={hue}
                                onChange={e => move(side, Number(e.target.value), shade)}
                                className="candle-colors__slider candle-colors__slider--hue"
                                title={`${label} candle colour`}
                                aria-label={`${label} candle colour`}
                            />
                            <span
                                className={`candle-colors__preview${isSet ? '' : ' candle-colors__preview--off'}`}
                                style={isSet ? { background: saved[side] } : undefined}
                            />
                            <span className="candle-colors__label">{label}</span>
                        </div>
                        <div className="candle-colors__row">
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={shade}
                                onChange={e => move(side, hue, Number(e.target.value))}
                                className="candle-colors__slider candle-colors__slider--shade"
                                style={{ background: candleShadeTrack(hue) }}
                                title={`${label} candle depth (dark ↔ light)`}
                                aria-label={`${label} candle depth`}
                            />
                            <span className="candle-colors__label">shade</span>
                        </div>
                    </div>
                )
            })}
            {active && (
                <button
                    type="button"
                    className="candle-colors__reset"
                    onClick={reset}
                    title="Reset candle colours to the theme default"
                >
                    reset
                </button>
            )}
        </div>
    )
}
