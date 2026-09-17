import { useState } from 'react'
import {
    loadCandleColors, defaultCandleColors, saveCandleColor, clearCandleColors,
    candleHexFromSliders, slidersFromHex, candleShadeTrack,
} from '../../services/candleColors.service'
import { queuePrefSync } from '../../services/preferences.service'
import './CandleColorPicker.scss'

// Up / down candle colour picker for the price chart, on the accent picker's two knobs per side:
// hue (the colour, full wheel) and shade (deep ↔ light). The sliders start where the theme
// default sits; until the user moves one, no override is applied. Applies live (inline vars on
// <html> + an event the mounted chart listens for) and syncs the choice to the account like the
// rest of the appearance preferences.
//
// Laid out DOWN · chart · UP: each side's two sliders sit on its own flank of a mini chart that
// paints a fixed run of candles with whatever the two sides currently resolve to — the override
// where set, else the theme default — so the choice is judged the way it will be seen (a body
// and wick on the dark pane, next to its opposite) and the two sides never stack into one
// confusing column of four tracks.

// Five candles in a 96×64 pane (y grows downward): a climb, a pullback, two more up, a red close.
// Filled body + same-colour wick, exactly how PriceChart styles klinecharts.
const PREVIEW_CANDLES = [
    { x: 12, side: 'up',   high: 14, open: 44, close: 22, low: 50 },
    { x: 30, side: 'down', high: 18, open: 24, close: 40, low: 46 },
    { x: 48, side: 'up',   high: 22, open: 42, close: 28, low: 48 },
    { x: 66, side: 'up',   high:  6, open: 30, close: 12, low: 36 },
    { x: 84, side: 'down', high: 10, open: 16, close: 34, low: 40 },
]
const BODY_W = 10

function CandlePreview({ colors }) {
    return (
        <svg
            className="candle-colors__chart"
            viewBox="0 0 96 64"
            role="img"
            aria-label="Candle colour preview"
        >
            {PREVIEW_CANDLES.map(c => {
                const top = Math.min(c.open, c.close), h = Math.abs(c.open - c.close)
                const fill = colors[c.side]
                return (
                    <g key={c.x} data-side={c.side} fill={fill} stroke={fill}>
                        <line x1={c.x} x2={c.x} y1={c.high} y2={c.low} strokeWidth="1.5" />
                        <rect x={c.x - BODY_W / 2} y={top} width={BODY_W} height={h} strokeWidth="1" rx="0.5" />
                    </g>
                )
            })}
        </svg>
    )
}

// One flank: a title, then the hue and shade tracks. Module-level on purpose — a component
// defined inside the picker would be a new type on every render, and React would remount the
// inputs on each slider tick, dropping a drag. No text labels beside the tracks: they would widen
// each flank past what the row can hold three-up; the tooltips + aria-labels name them.
function Flank({ side, label, hue, shade, onMove }) {
    return (
        <div className={`candle-colors__side candle-colors__side--${side}`}>
            <span className="candle-colors__label">{label} colors</span>
            <input
                type="range"
                min="0"
                max="360"
                value={hue}
                onChange={e => onMove(side, Number(e.target.value), shade)}
                className="candle-colors__slider candle-colors__slider--hue"
                title={`${label} candle colour`}
                aria-label={`${label} candle colour`}
            />
            <input
                type="range"
                min="0"
                max="100"
                value={shade}
                onChange={e => onMove(side, hue, Number(e.target.value))}
                className="candle-colors__slider candle-colors__slider--shade"
                style={{ background: candleShadeTrack(hue) }}
                title={`${label} candle depth (dark ↔ light)`}
                aria-label={`${label} candle depth`}
            />
        </div>
    )
}

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

    // What the chart paints right now — the same resolution effectiveCandleColors() makes.
    const base   = defaultCandleColors()
    const colors = { up: saved.up ?? base.up, down: saved.down ?? base.down }

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
            <Flank side="down" label="Down" {...sliders.down} onMove={move} />

            <div className="candle-colors__demo">
                <CandlePreview colors={colors} />
                {active
                    ? <button
                        type="button"
                        className="candle-colors__reset"
                        onClick={reset}
                        title="Reset candle colours to the theme default"
                      >
                        reset
                      </button>
                    : <span className="candle-colors__default">theme default</span>
                }
            </div>

            <Flank side="up"   label="Up"   {...sliders.up}   onMove={move} />
        </div>
    )
}
