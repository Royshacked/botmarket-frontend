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

// The pencil is the only .idea-card__edit-btn; the <article> also carries title="Open call",
// so select by class rather than title to stay unambiguous.
function clickPencil(container) {
    fireEvent.click(container.querySelector('.idea-card__edit-btn'))
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
        expect(container.querySelector('.idea-card__edit-btn').getAttribute('title')).toBe('Edit in chat')
    })

    it('still opens the pop-out for a CLOSED call (terminal, not re-armable)', () => {
        const onEdit = vi.fn()
        const { container } = render(<CallCard call={makeCall({ status: 'closed' })} onEdit={onEdit} onAct={vi.fn()} />)

        clickPencil(container)

        expect(onEdit).not.toHaveBeenCalled()
        expect(window.open).toHaveBeenCalledTimes(1)
    })

    it('still opens the pop-out for an IN-POSITION call (mid-trade edits go via management cards)', () => {
        const onEdit = vi.fn()
        const { container } = render(<CallCard call={makeCall({ status: 'long', invalidation_status: null })} onEdit={onEdit} onAct={vi.fn()} />)

        clickPencil(container)

        expect(onEdit).not.toHaveBeenCalled()
        expect(window.open).toHaveBeenCalledTimes(1)
    })

    it('dims the pencil (--locked) when editing is off, and keeps it plain when editable', () => {
        const { container: inPos } = render(<CallCard call={makeCall({ status: 'long', invalidation_status: null })} onEdit={vi.fn()} onAct={vi.fn()} />)
        const locked = inPos.querySelector('.idea-card__edit-btn')
        expect(locked.classList.contains('idea-card__edit-btn--locked')).toBe(true)
        expect(locked.getAttribute('title')).toBe('Open call (editing off in position)')

        cleanup()
        const { container: editable } = render(<CallCard call={makeCall()} onEdit={vi.fn()} onAct={vi.fn()} />)
        expect(editable.querySelector('.idea-card__edit-btn').classList.contains('idea-card__edit-btn--locked')).toBe(false)
    })
})
