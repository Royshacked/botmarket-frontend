import { useState, useRef, useEffect } from 'react'
import PropTypes from 'prop-types'
import { REASONING_OPTIONS, DEFAULT_REASONING } from './reasoningOptions.js'
// Reuses the ModelSelector styling (.model-sel) so the two header controls match.
import './ModelSelector.scss'

function CaretIcon() {
    return (
        <svg viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

function CheckIcon() {
    return (
        <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M2.5 6.2l2.2 2.3L9.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

export function ReasoningSelector({ value = DEFAULT_REASONING, onChange, disabled = false }) {
    const [isOpen, setIsOpen] = useState(false)
    const ref = useRef(null)

    useEffect(() => {
        if (!isOpen) return
        function onMouseDown(e) {
            if (!ref.current?.contains(e.target)) setIsOpen(false)
        }
        document.addEventListener('mousedown', onMouseDown)
        return () => document.removeEventListener('mousedown', onMouseDown)
    }, [isOpen])

    const current = REASONING_OPTIONS.find(r => r.id === value) ?? REASONING_OPTIONS[0]

    function select(id) {
        if (id !== value) onChange?.(id)
        setIsOpen(false)
    }

    return (
        <div className="model-sel" ref={ref}>
            <button
                className={`model-sel__trigger${isOpen ? ' model-sel__trigger--open' : ''}`}
                onClick={() => setIsOpen(o => !o)}
                disabled={disabled}
                title="How much the model reasons before answering"
                type="button"
            >
                <span className="model-sel__current">{current.short}</span>
                <CaretIcon />
            </button>

            {isOpen && (
                <div className="model-sel__dropdown">
                    <div className="model-sel__dropdown-title">reasoning</div>
                    {REASONING_OPTIONS.map(r => {
                        const selected = r.id === value
                        return (
                            <button
                                key={r.id}
                                className={`model-sel__item${selected ? ' model-sel__item--selected' : ''}`}
                                onClick={() => select(r.id)}
                                title={r.hint}
                                type="button"
                            >
                                <span className="model-sel__item-label">{r.label}</span>
                                {selected && <span className="model-sel__item-check"><CheckIcon /></span>}
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

ReasoningSelector.propTypes = {
    value:    PropTypes.string,
    onChange: PropTypes.func,
    disabled: PropTypes.bool,
}
