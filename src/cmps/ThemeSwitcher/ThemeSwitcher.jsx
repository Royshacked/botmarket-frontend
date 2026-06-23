import { useState } from 'react'
import { applyBgSpectrum, saveBgSpectrum, loadBgSpectrum, bgPreview } from '../../services/themeService'
import './ThemeSwitcher.scss'

// Background spectrum slider. Sweeps the app background through a curated path of
// very dark hues — dark cyan → dark teal → very dark green → dark blue → near-black
// — by regenerating the --bg-* tokens inline on <html>. Accent / text / wordmark
// are left untouched. Applies live, persists, and covers the backdrop + panels.
export function ThemeSwitcher() {
    const [pos, setPos] = useState(loadBgSpectrum)

    function apply(nextPos) {
        setPos(nextPos)
        applyBgSpectrum(nextPos)
        saveBgSpectrum(nextPos)
    }

    return (
        <div className="theme-switcher">
            <input
                type="range"
                min="0"
                max="100"
                value={pos}
                onChange={e => apply(Number(e.target.value))}
                className="theme-switcher__slider"
                title="Background colour"
                aria-label="Background colour"
            />
            <span
                className="theme-switcher__preview"
                style={{ background: bgPreview(pos) }}
            />
        </div>
    )
}
