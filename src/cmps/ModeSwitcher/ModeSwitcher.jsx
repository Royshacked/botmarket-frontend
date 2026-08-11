import { useState } from 'react'
import { loadAppearance, applyAppearance } from '../../services/themeService'
import { queuePrefSync } from '../../services/preferences.service'
import './ModeSwitcher.scss'

// Dark ⇄ light switch. Swaps which [data-theme] block the app wears and puts the background
// and accent generators into the matching band (themeService.applyAppearance), so the two
// sliders below this row keep meaning the same thing on paper as they do at night.
// Applies live, persists to localStorage, and syncs to the account like every other preference.
const MODES = [
    { id: 'dark',  label: 'Dark',  glyph: '◑' },
    { id: 'light', label: 'Light', glyph: '☀' },
]

// onChange lets the page re-key the sliders that paint their own track from the palette
// (ThemeSwitcher) — their gradients are computed at render, so they'd keep showing the
// previous band until something else re-rendered them.
export function ModeSwitcher({ onChange }) {
    const [mode, setMode] = useState(loadAppearance)

    function pick(next) {
        if (next === mode) return
        setMode(next)
        applyAppearance(next)
        queuePrefSync()
        onChange?.(next)
    }

    return (
        <div className="mode-switcher" role="group" aria-label="Appearance mode">
            {MODES.map(m => (
                <button
                    key={m.id}
                    type="button"
                    className={`mode-switcher__btn${mode === m.id ? ' mode-switcher__btn--active' : ''}`}
                    onClick={() => pick(m.id)}
                    aria-pressed={mode === m.id}
                    title={`${m.label} appearance`}
                >
                    <span className="mode-switcher__glyph" aria-hidden="true">{m.glyph}</span>
                    {m.label}
                </button>
            ))}
        </div>
    )
}
