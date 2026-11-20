import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { MODE_OPTIONS, modeOption } from './mode.utils.js'

// The MODE PICKER inside the prompt box, on its left (docs/design/modes-and-builders.md M4, Roy 2026-11-20): it shows the mode the chat is
// in — General, or the builder at work — and switches it. Axl switches it too, when the user asks to build (his route
// moves the floor, and this follows). The menu opens upward: the picker sits at the bottom of the chat.
export function ModePicker({ mode, onPick, disabled = false, pending = null }) {
    const [open, setOpen] = useState(false)
    const root = useRef(null)
    const current = modeOption(pending ?? mode)

    useEffect(() => {
        if (!open) return undefined
        const away = (e) => { if (!root.current?.contains(e.target)) setOpen(false) }
        const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
        document.addEventListener('mousedown', away)
        document.addEventListener('keydown', esc)
        return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
    }, [open])

    function pick(m) {
        setOpen(false)
        if (m !== mode) onPick(m)
    }

    return (
        <div className="mode-picker" ref={root}>
            <button
                type="button"
                className={`mode-picker__toggle${pending ? ' is-pending' : ''}`}
                onClick={() => setOpen(v => !v)}
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={open}
                title={`Mode: ${current.label} — click to switch`}
                aria-label={`Mode: ${current.label}`}
            >
                <span className="mode-picker__value">{current.short}</span>
                <span className="mode-picker__caret" aria-hidden="true">▾</span>
            </button>
            {open && (
                <ul className="mode-picker__menu" role="listbox" aria-label="Mode">
                    {MODE_OPTIONS.map(o => (
                        <li key={o.mode} role="option" aria-selected={o.mode === mode}>
                            <button type="button" className={`mode-picker__option${o.mode === mode ? ' is-current' : ''}`} onClick={() => pick(o.mode)}>
                                <span className="mode-picker__option-label">{o.label}</span>
                                <span className="mode-picker__option-hint">{o.hint}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}

ModePicker.propTypes = {
    mode:     PropTypes.string.isRequired,
    onPick:   PropTypes.func.isRequired,
    disabled: PropTypes.bool,
    // The mode just picked, until the server's floor arrives (a switch waits for a running turn).
    pending:  PropTypes.string,
}
