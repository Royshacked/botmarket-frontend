import { useState, useEffect } from 'react'
import './ThemeSwitcher.scss'

const THEMES = [
    { id: 'ocean',   label: 'Ocean'  },
    { id: 'forest',  label: 'Forest' },
    { id: 'crimson', label: 'Crimson'},
]

export function ThemeSwitcher() {
    const [theme, setTheme] = useState(
        () => localStorage.getItem('theme') ?? 'ocean'
    )

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme)
        localStorage.setItem('theme', theme)
    }, [theme])

    return (
        <div className="theme-switcher">
            {THEMES.map(t => (
                <button
                    key={t.id}
                    className={`theme-switcher__btn theme-switcher__btn--${t.id}${theme === t.id ? ' active' : ''}`}
                    onClick={() => setTheme(t.id)}
                    title={t.label}
                />
            ))}
        </div>
    )
}
