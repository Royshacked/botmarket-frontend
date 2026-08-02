import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import PropTypes from 'prop-types'

// Matches the dropdown's min-width in ChatPanel.scss. Used only as the pre-measurement estimate on
// the very first open, before the node exists to measure.
const DROPDOWN_MIN_W = 210

/**
 * The rectangle that will actually CLIP an absolutely-positioned child — the nearest ancestor whose
 * overflow isn't `visible`, or the viewport when there is none.
 *
 * The panels this selector lives in (.kairos-panel / .chat-panel) are overflow-hidden flex shells,
 * so "is there room on screen" is the wrong question: there can be room in the window and none in
 * the panel, which is exactly how half the dropdown ended up invisible in the trade ticket.
 */
function clippingRect(node) {
    for (let el = node?.parentElement; el; el = el.parentElement) {
        const { overflow, overflowX, overflowY } = getComputedStyle(el)
        if (/hidden|auto|scroll|clip/.test(`${overflow} ${overflowX} ${overflowY}`)) {
            return el.getBoundingClientRect()
        }
    }
    return { left: 0, right: window.innerWidth }
}

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
    // Which edge the dropdown hangs from. Default right — the trigger usually sits at the right of
    // its row (chat panel) and a right-anchored menu reads better there.
    const [alignLeft, setAlignLeft] = useState(false)
    const ref  = useRef(null)
    const menu = useRef(null)

    useEffect(() => {
        if (!isOpen) return
        function onMouseDown(e) {
            if (!ref.current?.contains(e.target)) setIsOpen(false)
        }
        document.addEventListener('mousedown', onMouseDown)
        return () => document.removeEventListener('mousedown', onMouseDown)
    }, [isOpen])

    // FLIP IF IT WOULD BE CLIPPED. A right-anchored menu grows LEFTWARDS from the trigger, and in
    // the trade ticket the trigger sits at the left edge of its row — so ~210px of menu ran off the
    // panel and was cut by the shell's overflow:hidden. The clipped strip is the left one, which is
    // where the checkboxes are, so the menu wasn't just ugly: the part you click was missing.
    //
    // Measured rather than hard-coded per call site, so any future placement is handled and no
    // caller has to know which way it should open. Layout effect: decided before paint, so the menu
    // never appears in the wrong place and jumps.
    useLayoutEffect(() => {
        if (!isOpen || !ref.current) return
        const trigger = ref.current.getBoundingClientRect()
        const clip    = clippingRect(ref.current)
        const width   = menu.current?.offsetWidth || DROPDOWN_MIN_W
        // Right-anchored puts the menu's left edge at (trigger.right - width).
        const overflowsLeft  = trigger.right - width < clip.left
        // Only flip if the other side actually fits, else we trade one clipped edge for another.
        const leftAlignFits  = trigger.left + width <= clip.right
        setAlignLeft(overflowsLeft && leftAlignFits)
    }, [isOpen, accounts.length])

    // VIRTUAL = paper or manual. It governs how an account is DISPLAYED (named, no login, its own
    // type badge) — not how many you may pick.
    const virtualMode  = accounts.length > 0 && accounts.every(a => a.broker === 'paper' || a.broker === 'manual')
    const virtualLabel = accounts[0]?.broker === 'manual' ? 'Manual' : 'Paper'

    // SINGLE-SELECT is manual only: the user places that trade at their own broker and reports one
    // fill back, so a second account has nothing distinct to report. Paper used to be lumped in
    // here, which was a UI rule with nothing behind it — the paper store is N-per-user and every
    // position, order and equity point already carries its accountId. Paper now behaves like live:
    // several accounts, balance-scaled off the starred main.
    const singleSelect = accounts.length > 0 && accounts.every(a => a.broker === 'manual')

    function toggle(id) {
        if (singleSelect) {
            onChange([id])
            if (onMainChange) onMainChange(id)
            return
        }
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
                <div className={`acct-sel__dropdown${alignLeft ? ' acct-sel__dropdown--left' : ''}`} ref={menu}>
                    <div className="acct-sel__dropdown-title">
                        accounts
                        {/* Said HERE, not only in the footer note: in a virtual workspace the radio
                            behaviour looks like a broken checkbox unless the rule is next to it. */}
                        {singleSelect && <span className="acct-sel__dropdown-rule">one per idea</span>}
                    </div>
                    {accounts.length === 0 ? (
                        <div className="acct-sel__empty">no accounts connected</div>
                    ) : (
                        accounts.map(acct => {
                            const checked   = selectedIds.includes(acct.id)
                            const isMain    = acct.id === mainAccountId
                            const isVirtual = acct.broker === 'paper' || acct.broker === 'manual'
                            const type      = isVirtual ? acct.broker : acct.isLive ? 'live' : 'demo'
                            return (
                                <label
                                    key={acct.id}
                                    className={`acct-sel__item${checked ? ' acct-sel__item--checked' : ''}${isMain ? ' acct-sel__item--main' : ''}`}
                                >
                                    <input
                                        type={singleSelect ? 'radio' : 'checkbox'}
                                        name={singleSelect ? 'acct-sel-single' : undefined}
                                        checked={checked}
                                        onChange={() => toggle(acct.id)}
                                    />
                                    <span className="acct-sel__item-broker">{isVirtual ? (acct.name ?? virtualLabel) : acct.broker}</span>
                                    {!isVirtual && <span className="acct-sel__item-login">{acct.login}</span>}
                                    <span className={`acct-sel__item-type ${type}`}>{type}</span>
                                    {/* Main-star only matters when scaling across several live accounts. */}
                                    {!singleSelect && checked && selectedIds.length > 1 && (
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
                    {virtualMode && (
                        <div className="acct-sel__paper-note">
                            {virtualLabel === 'Manual'
                                ? 'Manual mode — you execute this idea at your own broker (one account per idea).'
                                : 'Paper mode — this idea simulates on every account you mark. Several are scaled by balance off the starred main, exactly as a live idea is.'}
                        </div>
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
