import { useState } from 'react'
import { applyHueTheme, saveSpectrum, loadTone } from '../../services/themeService'
import './ThemeSwitcher.scss'

// One on-brand teal hue (the brand "a" aurora, #74C9AE), varied from brightest to
// darkest. The slider drives the theme's tone (brightness) while the hue stays put,
// so the whole app shifts between a light teal and a deep teal. The header keeps its
// own aurora palette.
const TEAL_HUE = 161

export function ThemeSwitcher() {
    const [tone, setTone] = useState(() =>
        localStorage.getItem('themeMode') === 'spectrum' ? loadTone() : 0
    )

    function apply(nextTone) {
        setTone(nextTone)
        // While the axl header is active the app is locked to the curated axl theme so
        // it always matches the header — don't let the slider recolour it off-palette.
        if (localStorage.getItem('headerStyle') !== 'classic') return
        applyHueTheme(TEAL_HUE, nextTone)
        saveSpectrum(TEAL_HUE, nextTone)
    }

    // Slider position: left = brightest (high tone), right = darkest (low tone).
    const pos = Math.round((1 - tone) * 100)

    return (
        <div className="theme-switcher">
            <input
                type="range"
                min="0"
                max="100"
                value={pos}
                onChange={e => apply(1 - Number(e.target.value) / 100)}
                className="theme-switcher__slider"
                title="Theme brightness"
                aria-label="Theme brightness"
            />
            <span
                className="theme-switcher__preview"
                style={{ background: `hsl(${TEAL_HUE}, 55%, ${Math.round(18 + tone * 62)}%)` }}
            />
        </div>
    )
}
