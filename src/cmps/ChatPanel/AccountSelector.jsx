import { useState, useRef, useEffect } from 'react'
import PropTypes from 'prop-types'

function StarIcon({ filled }) {
    return (
        <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
                d="M6 1l1.24 2.52 2.76.4-2 1.95.47 2.75L6 7.27 3.53 8.62 4 5.87 2 3.92l2.76-.4L6 1Z"
                fill={filled ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="1"
                strokeLinejoin="round"
            />
        </svg>
    )
}

export function AccountSelector({ accounts = [], selectedIds = [], onChange, mainAccountId = null, onMainChange }) {
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
        if (!next.includes(mainAccountId) && onMainChange) onMainChange(null)
        onChange(next)
    }

    function setMain(e, id) {
        e.preventDefault()
        e.stopPropagation()
        if (onMainChange) onMainChange(mainAccountId === id ? null : id)
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
                    <path d="M8 1.5L14 5H2L8 1.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                    <line x1="4"  y1="5.5" x2="4"  y2="11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    <line x1="8"  y1="5.5" x2="8"  y2="11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    <line x1="12" y1="5.5" x2="12" y2="11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    <line x1="2" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
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
                            const isMain  = acct.id === mainAccountId
                            return (
                                <label
                                    key={acct.id}
                                    className={`acct-sel__item${checked ? ' acct-sel__item--checked' : ''}${isMain ? ' acct-sel__item--main' : ''}`}
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
                                    {checked && selectedIds.length > 1 && (
                                        <button
                                            className={`acct-sel__main-btn${isMain ? ' is-main' : ''}`}
                                            onClick={(e) => setMain(e, acct.id)}
                                            title={isMain ? 'Remove as main' : 'Set as main account'}
                                            type="button"
                                        >
                                            <StarIcon filled={isMain} />
                                        </button>
                                    )}
                                </label>
                            )
                        })
                    )}
                    {selectedIds.length > 1 && !mainAccountId && (
                        <div className="acct-sel__main-hint">★ star an account to scale order quantities</div>
                    )}
                </div>
            )}
        </div>
    )
}

AccountSelector.propTypes = {
    accounts:      PropTypes.array,
    selectedIds:   PropTypes.arrayOf(PropTypes.string),
    onChange:      PropTypes.func.isRequired,
    mainAccountId: PropTypes.string,
    onMainChange:  PropTypes.func,
}
