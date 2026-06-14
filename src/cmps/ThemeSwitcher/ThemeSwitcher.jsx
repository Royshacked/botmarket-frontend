import { useState } from 'react'
import { applyHueTheme, saveSpectrum, spectrumPreview, DEFAULT_HUE } from '../../services/themeService'
import './ThemeSwitcher.scss'

export function ThemeSwitcher() {
    const [hue, setHue] = useState(() => Number(localStorage.getItem('themeHue')) || DEFAULT_HUE)

    function changeHue(nextHue) {
        applyHueTheme(nextHue)
        saveSpectrum(nextHue)
        setHue(nextHue)
    }

    return (
        <div className="theme-switcher">
            <div className="theme-switcher__spectrum">
                <input
                    type="range"
                    min="0"
                    max="360"
                    value={hue}
                    onChange={e => changeHue(Number(e.target.value))}
                    className="theme-switcher__slider"
                    title="Theme color"
                    aria-label="Theme color"
                />
                <span
                    className="theme-switcher__preview"
                    style={{ background: spectrumPreview(hue) }}
                />
            </div>
        </div>
    )
}
