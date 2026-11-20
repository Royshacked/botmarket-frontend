import { useState } from 'react'
import { loadAppearance, applyAppearance } from '../../services/themeService'
import { queuePrefSync } from '../../services/preferences.service'
import './ModeSwitcher.scss'

// The theme picker: Black · Grey · White. Swaps which [data-theme] block the app wears and puts
// the accent generator into the matching band (themeService.applyAppearance).
// Applies live, persists to localStorage, and syncs to the account like every other preference.
// Each button carries a swatch of its own page colour, so the choice reads before it is made.
const MODES = [
    { id: 'black', label: 'Black' },
    { id: 'grey',  label: 'Grey'  },
    { id: 'white', label: 'White' },
]

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
        <div className="mode-switcher" role="group" aria-label="Theme">
            {MODES.map(m => (
                <button
                    key={m.id}
                    type="button"
                    className={`mode-switcher__btn${mode === m.id ? ' mode-switcher__btn--active' : ''}`}
                    onClick={() => pick(m.id)}
                    aria-pressed={mode === m.id}
                    title={`${m.label} theme`}
                >
                    <span className={`mode-switcher__swatch mode-switcher__swatch--${m.id}`} aria-hidden="true" />
                    {m.label}
                </button>
            ))}
        </div>
    )
}
