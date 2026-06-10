import { useState, useRef, useEffect } from 'react'
import PropTypes from 'prop-types'

export function AccountSelector({ accounts = [], selectedIds = [], onChange }) {
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

    function toggle(id) {
        const next = selectedIds.includes(id)
            ? selectedIds.filter(x => x !== id)
            : [...selectedIds, id]
        onChange(next)
    }

    const count = selectedIds.length

    return (
        <div className="acct-sel" ref={ref}>
            <button
                className={`acct-sel__trigger${count > 0 ? ' acct-sel__trigger--active' : ''}`}
                onClick={() => setIsOpen(o => !o)}
                title="Select accounts for this idea"
                type="button"
            >
                <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    {/* roof */}
                    <path d="M8 1.5L14 5H2L8 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                    {/* columns */}
                    <line x1="4"  y1="5.5" x2="4"  y2="11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    <line x1="8"  y1="5.5" x2="8"  y2="11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    <line x1="12" y1="5.5" x2="12" y2="11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    {/* base */}
                    <line x1="2" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                {count > 0 && <span className="acct-sel__count">{count}</span>}
            </button>

            {isOpen && (
                <div className="acct-sel__dropdown">
                    <div className="acct-sel__dropdown-title">accounts</div>
                    {accounts.length === 0 ? (
                        <div className="acct-sel__empty">no accounts connected</div>
                    ) : (
                        accounts.map(acct => {
                            const checked = selectedIds.includes(acct.id)
                            return (
                                <label
                                    key={acct.id}
                                    className={`acct-sel__item${checked ? ' acct-sel__item--checked' : ''}`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggle(acct.id)}
                                    />
                                    <span className="acct-sel__item-broker">{acct.broker}</span>
                                    <span className="acct-sel__item-login">{acct.login}</span>
                                    <span className={`acct-sel__item-type ${acct.isLive ? 'live' : 'demo'}`}>
                                        {acct.isLive ? 'live' : 'demo'}
                                    </span>
                                </label>
                            )
                        })
                    )}
                </div>
            )}
        </div>
    )
}

AccountSelector.propTypes = {
    accounts:    PropTypes.array,
    selectedIds: PropTypes.arrayOf(PropTypes.string),
    onChange:    PropTypes.func.isRequired,
}
