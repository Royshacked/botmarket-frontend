import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { CallCard } from './CallCard.jsx'

function makeCall(overrides = {}) {
    const base = {
        id:          'call_FITB_5a9103df',
        asset:       'FITB',
        bias:        'long',
        trade_type:  'swing',
        // A thesis that went stale is `looking` + the INVALIDATION latch — not a status of its
        // own. 'expired' was a call-only lifecycle word; it no longer exists.
        status:              'looking',
        invalidation_status: 'fired',
        entry_zones: [{ side: 'long', lower: 40, upper: 41, kind: 'demand' }],
        savedAt:     1_700_000_000_000,
    }
    return { ...base, ...overrides }
}

// The pencil is the only .icon-btn; the <article> also carries title="Open call",
// so select by class rather than title to stay unambiguous.
function clickPencil(container) {
    fireEvent.click(container.querySelector('.icon-btn'))
}

describe('CallCard edit pencil', () => {
    beforeEach(() => {
        // window.open (mocked to null) stands in for the pop-out; the fix must avoid it for
        // chat-editable statuses. openCallPopup guards on a truthy popup, so null is safe.
        vi.spyOn(window, 'open').mockImplementation(() => null)
    })
    afterEach(() => {
        vi.restoreAllMocks()
        cleanup()
    })

    it('routes an INVALIDATED call to in-app edit (onEdit), not the pop-out', () => {
        const onEdit = vi.fn()
        const { container } = render(<CallCard call={makeCall()} onEdit={onEdit} onAct={vi.fn()} />)

        clickPencil(container)

        expect(onEdit).toHaveBeenCalledTimes(1)
        expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'call_FITB_5a9103df' }))
        expect(window.open).not.toHaveBeenCalled()   // the regression: a stale thesis must re-map in chat
    })

    it('labels the invalidated pencil "Edit in chat"', () => {
        const { container } = render(<CallCard call={makeCall()} onEdit={vi.fn()} onAct={vi.fn()} />)
        expect(container.querySelector('.icon-btn').getAttribute('title')).toBe('Edit in chat')
    })

    // The pencil used to grey out but still fire, opening the pop-out. A control that looks dead
    // and acts alive is the worse of the two: it's now disabled outright, and the card body is the
    // one way to the pop-out.
    it('disables the pencil on a CLOSED call (terminal, not re-armable)', () => {
        const onEdit = vi.fn()
        const { container } = render(<CallCard call={makeCall({ status: 'closed' })} onEdit={onEdit} onAct={vi.fn()} />)

        clickPencil(container)

        expect(container.querySelector('.icon-btn').disabled).toBe(true)
        expect(onEdit).not.toHaveBeenCalled()
        expect(window.open).not.toHaveBeenCalled()
    })

    it('disables the pencil IN POSITION (mid-trade edits go via management cards)', () => {
        const onEdit = vi.fn()
        const { container } = render(<CallCard call={makeCall({ status: 'long', invalidation_status: null })} onEdit={onEdit} onAct={vi.fn()} />)

        clickPencil(container)

        expect(container.querySelector('.icon-btn').disabled).toBe(true)
        expect(onEdit).not.toHaveBeenCalled()
        expect(window.open).not.toHaveBeenCalled()
    })

    it('greys the pencil (--locked) when editing is off, and keeps it plain when editable', () => {
        const { container: inPos } = render(<CallCard call={makeCall({ status: 'long', invalidation_status: null })} onEdit={vi.fn()} onAct={vi.fn()} />)
        const locked = inPos.querySelector('.icon-btn')
        expect(locked.classList.contains('icon-btn--locked')).toBe(true)
        expect(locked.getAttribute('title')).toBe('Editing is off once the position is live')

        cleanup()
        const editablePencil = render(<CallCard call={makeCall()} onEdit={vi.fn()} onAct={vi.fn()} />)
            .container.querySelector('.icon-btn')
        expect(editablePencil.classList.contains('icon-btn--locked')).toBe(false)
        expect(editablePencil.disabled).toBe(false)
    })
})
