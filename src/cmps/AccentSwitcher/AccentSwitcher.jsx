import { useState } from 'react'
import {
    applyAccentHue, clearAccentHue, saveAccentHue, saveAccentShade, clearSavedAccentHue,
    loadAccentHue, loadAccentShade, accentPreview, DEFAULT_AURORA_HUE, DEFAULT_ACCENT_SHADE,
    applyAuroraHue, saveAuroraHue, isLight,
} from '../../services/themeService'
import { queuePrefSync } from '../../services/preferences.service'
import './AccentSwitcher.scss'

// Accent picker. The first choice is the THEME's own accent — white on Black and Grey, teal on
// White (Roy, 2026-11-20) — selected whenever no colour override is saved; clicking it clears one.
// After it, two knobs for a colour of your own: hue (the full wheel) and shade (drag left to
// deepen, right to lighten). A colour recolors the whole accent spectrum (accent family + glows +
// headings/wordmark) live as inline vars on <html>, over the theme's accent. The hue also drives
// the global aurora anchor (--aurora-hue), so the header's calm-water wave tracks it.
//
// The page re-keys this on a theme switch (UserProfile), so the first choice's name and swatch
// follow the theme without a reload.
export function AccentSwitcher() {
    const savedHue = loadAccentHue()
    const [hue, setHue]       = useState(savedHue ?? DEFAULT_AURORA_HUE)
    const [shade, setShade]   = useState(savedHue === null ? DEFAULT_ACCENT_SHADE : loadAccentShade())
    const [active, setActive] = useState(savedHue !== null)
    const light = isLight()
    const themeAccent = light ? { label: 'Teal', swatch: '#266861' } : { label: 'White', swatch: '#FFFFFF' }

    function apply(nextHue, nextShade) {
        setHue(nextHue)
        setShade(nextShade)
        setActive(true)
        applyAccentHue(nextHue, nextShade)
        saveAccentHue(nextHue)
        saveAccentShade(nextShade)
        // The hue also rotates the shared aurora wash so the backdrop glow matches.
        applyAuroraHue(nextHue)
        saveAuroraHue(nextHue)
        queuePrefSync()
    }

    function pickThemeAccent() {
        if (!active) return
        setActive(false)
        setHue(DEFAULT_AURORA_HUE)   // return the hue slider to the default position too
        setShade(DEFAULT_ACCENT_SHADE)
        clearAccentHue()
        clearSavedAccentHue()
        // Restore the aurora wash to its brand default alongside the accent.
        applyAuroraHue(DEFAULT_AURORA_HUE)
        saveAuroraHue(DEFAULT_AURORA_HUE)
        queuePrefSync()
    }

    // Shade track: this hue from deep → mid → light, so the gradient reflects the
    // colour currently picked.
    const shadeTrack = `linear-gradient(to right, hsl(${hue},60%,12%), hsl(${hue},60%,46%), hsl(${hue},55%,82%))`

    return (
        <div className="accent-switcher">
            <div className="accent-switcher__row">
                <button
                    type="button"
                    className={`accent-switcher__theme${active ? '' : ' accent-switcher__theme--on'}`}
                    onClick={pickThemeAccent}
                    aria-pressed={!active}
                    title={`The theme's own accent (${themeAccent.label.toLowerCase()})`}
                >
                    <span className="accent-switcher__dot" style={{ background: themeAccent.swatch }} aria-hidden="true" />
                    {themeAccent.label}
                </button>
                <input
                    type="range"
                    min="0"
                    max="360"
                    value={hue}
                    onChange={e => apply(Number(e.target.value), shade)}
                    className={`accent-switcher__slider accent-switcher__slider--hue${active ? '' : ' accent-switcher__slider--idle'}`}
                    title="Pick a colour instead"
                    aria-label="Accent colour"
                />
                <span
                    className="accent-switcher__preview"
                    style={{ background: active ? accentPreview(hue, shade) : themeAccent.swatch }}
                />
            </div>
            <div className="accent-switcher__row">
                <span className="accent-switcher__theme-gap" aria-hidden="true" />
                <input
                    type="range"
                    min="0"
                    max="100"
                    value={shade}
                    onChange={e => apply(hue, Number(e.target.value))}
                    className={`accent-switcher__slider accent-switcher__slider--shade${active ? '' : ' accent-switcher__slider--idle'}`}
                    style={{ background: shadeTrack }}
                    title="Accent depth (dark ↔ light)"
                    aria-label="Accent depth"
                />
                <span className="accent-switcher__shade-label">shade</span>
            </div>
        </div>
    )
}
