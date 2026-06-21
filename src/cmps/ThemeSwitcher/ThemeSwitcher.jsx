import { useState } from 'react'
import { applyAuroraHue, saveAuroraHue, loadAuroraHue } from '../../services/themeService'
import './ThemeSwitcher.scss'

// Aurora hue slider. Rotates the app-wide aurora wash — the green→teal→cyan→violet
// backdrop shared by the header and every panel — by setting the global
// --aurora-hue. All four stops shift together (fixed offsets in _themes.scss), so
// the anchor/brightest colour moves across the spectrum (e.g. teal → green) and the
// rest of the spread follows. Applies live, persists, and works for every part of
// the app including the header.
export function ThemeSwitcher() {
    const [hue, setHue] = useState(loadAuroraHue)

    function apply(nextHue) {
        setHue(nextHue)
        applyAuroraHue(nextHue)
        saveAuroraHue(nextHue)
    }

    return (
        <div className="theme-switcher">
            <input
                type="range"
                min="0"
                max="360"
                value={hue}
                onChange={e => apply(Number(e.target.value))}
                className="theme-switcher__slider"
                title="Aurora hue"
                aria-label="Aurora hue"
            />
            <span
                className="theme-switcher__preview"
                style={{ background: `hsl(${hue}, 52%, 58%)` }}
            />
        </div>
    )
}
