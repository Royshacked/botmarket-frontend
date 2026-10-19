import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { CallCard } from './CallCard.jsx'

function makeCall(overrides = {}) {
    const base = {
        id:          'call_FITB_5a9103df',
        asset:       'FITB',
        bias:        'long',
        trade_type:  'swing',
        status:              'looking',
        invalidation_status: 'fired',
        // A call is an ARCHIVED Kairos document and keeps the band shape — see CallCard.
        entry_zones: [{ side: 'long', lower: 40, upper: 41, kind: 'demand' }],
        savedAt:     1_700_000_000_000,
    }
    return { ...base, ...overrides }
}

describe('CallCard controls', () => {
    afterEach(cleanup)

    // Kairos is archived, so there is no chat to edit a call in: the card offers no pencil at all
    // (it used to render one that was always locked). The card body is the way to the pop-out.
    it('renders no edit pencil', () => {
        const { container } = render(<CallCard call={makeCall()} onAct={vi.fn()} />)
        expect(container.querySelector('.icon-btn')).toBeNull()
    })

    it('keeps the delete control when onDelete is given', () => {
        const onDelete = vi.fn()
        const { container } = render(<CallCard call={makeCall()} onAct={vi.fn()} onDelete={onDelete} />)
        expect(container.querySelectorAll('.icon-btn')).toHaveLength(1)
    })
})
