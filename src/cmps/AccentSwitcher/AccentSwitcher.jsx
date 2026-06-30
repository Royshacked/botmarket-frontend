import { useState } from 'react'
import {
    applyAccentHue, clearAccentHue, saveAccentHue, saveAccentShade, clearSavedAccentHue,
    loadAccentHue, loadAccentShade, accentPreview, DEFAULT_AURORA_HUE, DEFAULT_ACCENT_SHADE,
} from '../../services/themeService'
import './AccentSwitcher.scss'

// Accent picker on two knobs: hue (the colour, full wheel) and shade (depth —
// drag left to deepen toward dark/rich, right to lighten). Recolors the whole
// accent spectrum (accent family + glows + headings/wordmark) live as inline vars
// on <html>, overriding the active theme/design accent. Until the user moves it,
// no override is applied — "reset" returns to the theme/design default.
export function AccentSwitcher() {
    const savedHue = loadAccentHue()
    const [hue, setHue]       = useState(savedHue ?? DEFAULT_AURORA_HUE)
    const [shade, setShade]   = useState(savedHue === null ? DEFAULT_ACCENT_SHADE : loadAccentShade())
    const [active, setActive] = useState(savedHue !== null)

    function apply(nextHue, nextShade) {
        setHue(nextHue)
        setShade(nextShade)
        setActive(true)
        applyAccentHue(nextHue, nextShade)
        saveAccentHue(nextHue)
        saveAccentShade(nextShade)
    }

    function reset() {
        setActive(false)
        setShade(DEFAULT_ACCENT_SHADE)
        clearAccentHue()
        clearSavedAccentHue()
    }

    // Shade track: this hue from deep → mid → light, so the gradient reflects the
    // colour currently picked.
    const shadeTrack = `linear-gradient(to right, hsl(${hue},60%,12%), hsl(${hue},60%,46%), hsl(${hue},55%,82%))`

    return (
        <div className="accent-switcher">
            <div className="accent-switcher__row">
                <input
                    type="range"
                    min="0"
                    max="360"
                    value={hue}
                    onChange={e => apply(Number(e.target.value), shade)}
                    className="accent-switcher__slider accent-switcher__slider--hue"
                    title="Accent colour"
                    aria-label="Accent colour"
                />
                <span
                    className={`accent-switcher__preview${active ? '' : ' accent-switcher__preview--off'}`}
                    style={active ? { background: accentPreview(hue, shade) } : undefined}
                />
                {active && (
                    <button
                        type="button"
                        className="accent-switcher__reset"
                        onClick={reset}
                        title="Reset accent to the theme/design default"
                    >
                        reset
                    </button>
                )}
            </div>
            <div className="accent-switcher__row">
                <input
                    type="range"
                    min="0"
                    max="100"
                    value={shade}
                    onChange={e => apply(hue, Number(e.target.value))}
                    className="accent-switcher__slider accent-switcher__slider--shade"
                    style={{ background: shadeTrack }}
                    title="Accent depth (dark ↔ light)"
                    aria-label="Accent depth"
                />
                <span className="accent-switcher__shade-label">shade</span>
            </div>
        </div>
    )
}
