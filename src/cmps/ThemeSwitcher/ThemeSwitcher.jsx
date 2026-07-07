import { useState } from 'react'
import {
    applyBgSpectrum, saveBgSpectrum, loadBgSpectrum, saveBgShade, loadBgShade,
    bgPreview, bgTrackGradient, bgShadeTrack,
} from '../../services/themeService'
import { queuePrefSync } from '../../services/preferences.service'
import './ThemeSwitcher.scss'

// Background spectrum slider. Sweeps the app background through a curated path of
// very dark hues spanning the whole colour wheel — maroon → ember → gold → green →
// teal → cyan → blue → indigo → violet → magenta → near-black — by regenerating the
// --bg-* tokens inline on <html>. Accent / text / wordmark are left untouched.
// A second 'shade' slider sets the depth (how dark ↔ light the whole scale sits).
// Applies live, persists, and covers the backdrop + panels.
export function ThemeSwitcher() {
    const [pos, setPos]     = useState(loadBgSpectrum)
    const [shade, setShade] = useState(loadBgShade)

    function apply(nextPos, nextShade) {
        setPos(nextPos)
        setShade(nextShade)
        applyBgSpectrum(nextPos, nextShade)
        saveBgSpectrum(nextPos)
        saveBgShade(nextShade)
        queuePrefSync()
    }

    return (
        <div className="theme-switcher">
            <div className="theme-switcher__row">
                <input
                    type="range"
                    min="0"
                    max="100"
                    value={pos}
                    onChange={e => apply(Number(e.target.value), shade)}
                    className="theme-switcher__slider"
                    style={{ background: bgTrackGradient() }}
                    title="Background colour"
                    aria-label="Background colour"
                />
                <span
                    className="theme-switcher__preview"
                    style={{ background: bgPreview(pos) }}
                />
            </div>
            <div className="theme-switcher__row">
                <input
                    type="range"
                    min="0"
                    max="100"
                    value={shade}
                    onChange={e => apply(pos, Number(e.target.value))}
                    className="theme-switcher__slider theme-switcher__slider--shade"
                    style={{ background: bgShadeTrack(pos) }}
                    title="Background depth (dark ↔ light)"
                    aria-label="Background depth"
                />
                <span className="theme-switcher__shade-label">shade</span>
            </div>
        </div>
    )
}
