import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { AccountSelector } from './AccountSelector.jsx'

afterEach(cleanup)

// The dropdown is absolutely positioned and grows LEFTWARDS from its trigger. In the trade ticket
// the trigger sits at the left edge of its row inside an overflow-hidden panel, so ~210px of menu
// ran off the panel and was cut — and the clipped strip is the one holding the checkboxes.
//
// jsdom reports every rect as zeroes, so the geometry is stubbed per element: the point under test
// is the DECISION (which edge to hang from), not the browser's layout.

const live = [
    { id: 'a', broker: 'ctrader', login: '1001', isLive: true },
    { id: 'b', broker: 'ctrader', login: '2002', isLive: true },
]
const paper = [
    { id: 'p1', broker: 'paper', name: 'Paper A' },
    { id: 'p2', broker: 'paper', name: 'Paper B' },
]
const manual = [
    { id: 'm1', broker: 'manual', name: 'My broker' },
    { id: 'm2', broker: 'manual', name: 'Other broker' },
]

/**
 * Place the trigger and its clipping ancestor on an imaginary screen.
 * `triggerRight` is where the menu's right edge would sit; the menu is 210 wide.
 */
function stubGeometry({ triggerLeft, triggerRight, clipLeft, clipRight }) {
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => ({
        overflow: el?.dataset?.clip ? 'hidden' : 'visible', overflowX: 'visible', overflowY: 'visible',
        // AccountSelector only reads the overflow trio.
    }))
    Element.prototype.getBoundingClientRect = function () {
        if (this.dataset?.clip) return { left: clipLeft, right: clipRight, top: 0, bottom: 500 }
        if (this.classList.contains('acct-sel')) return { left: triggerLeft, right: triggerRight, top: 0, bottom: 20 }
        return { left: 0, right: 0, top: 0, bottom: 0 }
    }
}

function open(accounts, geometry, props = {}) {
    stubGeometry(geometry)
    const { container } = render(
        <div data-clip="1">
            <AccountSelector accounts={accounts} selectedIds={[]} onChange={() => {}} {...props} />
        </div>,
    )
    fireEvent.click(screen.getByTitle('Select accounts for this idea'))
    return container.querySelector('.acct-sel__dropdown')
}

describe('AccountSelector dropdown placement', () => {
    it('flips to the left edge when a right-anchored menu would be clipped', () => {
        // Trigger hugging the panel's left edge — 210px of menu would land at -190.
        const menu = open(live, { triggerLeft: 10, triggerRight: 30, clipLeft: 0, clipRight: 400 })
        expect(menu.className).toContain('acct-sel__dropdown--left')
    })

    it('stays right-anchored when there is room, which is the better default', () => {
        const menu = open(live, { triggerLeft: 350, triggerRight: 380, clipLeft: 0, clipRight: 400 })
        expect(menu.className).not.toContain('acct-sel__dropdown--left')
    })

    it('does NOT flip when the other side is clipped too — no trading one bad edge for another', () => {
        // A panel narrower than the menu: neither anchor fits, so keep the default.
        const menu = open(live, { triggerLeft: 10, triggerRight: 30, clipLeft: 0, clipRight: 120 })
        expect(menu.className).not.toContain('acct-sel__dropdown--left')
    })

    it('measures the nearest CLIPPING ancestor, not the window', () => {
        // Plenty of window to the left, none inside the panel. Getting this wrong is the original
        // bug: the menu fits on screen and is still cut in half by the panel.
        const menu = open(live, { triggerLeft: 610, triggerRight: 630, clipLeft: 600, clipRight: 1000 })
        expect(menu.className).toContain('acct-sel__dropdown--left')
    })
})

describe('AccountSelector selection mode', () => {
    it('live accounts multi-select, and the click ADDS rather than replaces', () => {
        stubGeometry({ triggerLeft: 350, triggerRight: 380, clipLeft: 0, clipRight: 400 })
        const onChange = vi.fn()
        render(
            <div data-clip="1">
                <AccountSelector accounts={live} selectedIds={['a']} onChange={onChange} mainAccountId="a" />
            </div>,
        )
        fireEvent.click(screen.getByTitle('Select accounts for this idea'))
        expect(screen.getAllByRole('checkbox')).toHaveLength(2)

        fireEvent.click(screen.getAllByRole('checkbox')[1])
        expect(onChange).toHaveBeenCalledWith(['a', 'b'])
    })

    it('PAPER multi-selects like live — the one-per-idea rule was a UI limit with nothing behind it', () => {
        // The paper store is N-accounts-per-user and its positions/orders/equity all carry an
        // accountId, so an idea across two paper accounts plans and fills like two live ones.
        stubGeometry({ triggerLeft: 350, triggerRight: 380, clipLeft: 0, clipRight: 400 })
        const onChange = vi.fn()
        render(
            <div data-clip="1">
                <AccountSelector accounts={paper} selectedIds={['p1']} onChange={onChange} mainAccountId="p1" />
            </div>,
        )
        fireEvent.click(screen.getByTitle('Select accounts for this idea'))
        expect(screen.getAllByRole('checkbox')).toHaveLength(2)
        expect(screen.queryByText('one per idea')).toBeNull()

        // Adds, never replaces — replacing is what the old virtual-mode branch did.
        fireEvent.click(screen.getAllByRole('checkbox')[1])
        expect(onChange).toHaveBeenCalledWith(['p1', 'p2'])
    })

    it('two marked paper accounts can be starred for a main, so quantities scale', () => {
        stubGeometry({ triggerLeft: 350, triggerRight: 380, clipLeft: 0, clipRight: 400 })
        const onMainChange = vi.fn()
        render(
            <div data-clip="1">
                <AccountSelector
                    accounts={paper} selectedIds={['p1', 'p2']} onChange={() => {}}
                    mainAccountId={null} onMainChange={onMainChange}
                />
            </div>,
        )
        fireEvent.click(screen.getByTitle('Select accounts for this idea'))
        const stars = screen.getAllByTitle('Set as main account')
        expect(stars).toHaveLength(2)
        fireEvent.click(stars[0])
        expect(onMainChange).toHaveBeenCalledWith('p1')
    })

    it('MANUAL still binds one account per idea — the user reports one fill, from one broker', () => {
        stubGeometry({ triggerLeft: 350, triggerRight: 380, clipLeft: 0, clipRight: 400 })
        const onChange = vi.fn()
        render(
            <div data-clip="1">
                <AccountSelector accounts={manual} selectedIds={['m1']} onChange={onChange} mainAccountId="m1" />
            </div>,
        )
        fireEvent.click(screen.getByTitle('Select accounts for this idea'))
        expect(screen.getAllByRole('radio')).toHaveLength(2)
        expect(screen.getByText('one per idea')).toBeTruthy()

        fireEvent.click(screen.getAllByRole('radio')[1])
        expect(onChange).toHaveBeenCalledWith(['m2'])
    })

    it('a mixed live+paper list is NOT virtual — the live rules win', () => {
        stubGeometry({ triggerLeft: 350, triggerRight: 380, clipLeft: 0, clipRight: 400 })
        render(
            <div data-clip="1">
                <AccountSelector accounts={[...live, ...paper]} selectedIds={[]} onChange={() => {}} />
            </div>,
        )
        fireEvent.click(screen.getByTitle('Select accounts for this idea'))
        expect(screen.getAllByRole('checkbox')).toHaveLength(4)
        expect(screen.queryByText('one per idea')).toBeNull()
    })
})

describe('AccountSelector badge vs list', () => {
    // Reported from the desk: the bank icon in the chat header read "1", and the menu it opened
    // had nothing ticked. The badge was `selectedIds.length` — a raw count with no lookup — while a
    // row only ticks when the id resolves against `accounts`. A user standing in PAPER whose
    // selection still held a cTrader id (carried over from opening a live holding, since one
    // selection is shared by every desk) got a count for a row that could not exist.
    const geometry = { triggerLeft: 350, triggerRight: 380, clipLeft: 0, clipRight: 400 }

    it('counts only the accounts this workspace can actually show', () => {
        stubGeometry(geometry)
        const { container } = render(
            <div data-clip="1">
                {/* the paper book on screen, still holding the live holding's cTrader account */}
                <AccountSelector accounts={paper} selectedIds={['46115894']} onChange={() => {}} />
            </div>,
        )
        expect(container.querySelector('.acct-sel__count')).toBeNull()
        fireEvent.click(screen.getByTitle('Select accounts for this idea'))
        expect(screen.getAllByRole('checkbox').every(cb => !cb.checked)).toBe(true)
    })

    it('says so rather than dropping it — an invisible selection is what looked broken', () => {
        stubGeometry(geometry)
        render(
            <div data-clip="1">
                <AccountSelector accounts={paper} selectedIds={['46115894']} onChange={() => {}} />
            </div>,
        )
        fireEvent.click(screen.getByTitle('Select accounts for this idea'))
        expect(screen.getByText('1 marked account belongs to another workspace')).toBeTruthy()
    })

    it('counts the resolvable ones alongside an unlistable one', () => {
        stubGeometry(geometry)
        const { container } = render(
            <div data-clip="1">
                <AccountSelector accounts={paper} selectedIds={['p1', 'p2', '46115894']} onChange={() => {}} />
            </div>,
        )
        expect(container.querySelector('.acct-sel__count').textContent).toBe('2')
        fireEvent.click(screen.getByTitle('Select accounts for this idea'))
        expect(screen.getByText('1 marked account belongs to another workspace')).toBeTruthy()
    })

    it('KEEPS the unlistable id through a toggle — a binding is not rewritten by who is looking', () => {
        stubGeometry(geometry)
        const onChange = vi.fn()
        render(
            <div data-clip="1">
                <AccountSelector accounts={paper} selectedIds={['46115894']} onChange={onChange} />
            </div>,
        )
        fireEvent.click(screen.getByTitle('Select accounts for this idea'))
        fireEvent.click(screen.getAllByRole('checkbox')[0])
        expect(onChange).toHaveBeenCalledWith(['46115894', 'p1'])
    })

    it('an empty account list is not a phantom either — nothing connected, nothing counted', () => {
        stubGeometry(geometry)
        const { container } = render(
            <div data-clip="1">
                <AccountSelector accounts={[]} selectedIds={['p1']} onChange={() => {}} />
            </div>,
        )
        expect(container.querySelector('.acct-sel__count')).toBeNull()
        fireEvent.click(screen.getByTitle('Select accounts for this idea'))
        expect(screen.getByText('no accounts connected')).toBeTruthy()
        expect(screen.getByText('1 marked account belongs to another workspace')).toBeTruthy()
    })
})
