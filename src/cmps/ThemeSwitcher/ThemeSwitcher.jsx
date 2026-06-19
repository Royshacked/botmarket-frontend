import { useState } from 'react'
import { applyHueTheme, saveSpectrum, spectrumPreview, loadTone, DEFAULT_HUE } from '../../services/themeService'
import './ThemeSwitcher.scss'

export function ThemeSwitcher() {
    const [hue, setHue]   = useState(() => Number(localStorage.getItem('themeHue')) || DEFAULT_HUE)
    const [tone, setTone] = useState(loadTone) // 0 = black … 1 = white

    function apply(nextHue, nextTone) {
        applyHueTheme(nextHue, nextTone)
        saveSpectrum(nextHue, nextTone)
        setHue(nextHue)
        setTone(nextTone)
    }

    return (
        <div className="theme-switcher">
            {/* Color (hue) */}
            <div className="theme-switcher__spectrum">
                <input
                    type="range"
                    min="0"
                    max="360"
                    value={hue}
                    onChange={e => apply(Number(e.target.value), tone)}
                    className="theme-switcher__slider theme-switcher__slider--hue"
                    title="Theme color"
                    aria-label="Theme color"
                />
                <span
                    className="theme-switcher__preview"
                    style={{ background: spectrumPreview(hue, tone) }}
                />
            </div>

            {/* Brightness (tone): white → black */}
            <div className="theme-switcher__spectrum">
                <input
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round(tone * 100)}
                    onChange={e => apply(hue, Number(e.target.value) / 100)}
                    className="theme-switcher__slider theme-switcher__slider--tone"
                    title="Theme brightness"
                    aria-label="Theme brightness"
                />
                <span
                    className="theme-switcher__preview"
                    style={{ background: spectrumPreview(hue, tone) }}
                />
            </div>
        </div>
    )
}
