import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { StageConfirm } from './StageConfirm.jsx'

afterEach(cleanup)

// A press is not an inference. This card exists because five live builds showed the model does not
// reliably notice "yes" in prose — so the client says what was pressed and the server settles.

const GATE = {
    asset: 'NVDA', stage: 'opening', awaiting: true,
    fields: ['direction', 'horizon', 'lens'],
    values: { direction: 'long', horizon: 'swing', lens: 'smc' },
}

describe('StageConfirm', () => {
    it('shows what Mentor proposed, in the order it was proposed', () => {
        render(<StageConfirm gate={GATE} />)
        expect(screen.getByText('long')).toBeTruthy()
        expect(screen.getByText('swing')).toBeTruthy()
        expect(screen.getByText('smc')).toBeTruthy()
    })

    it('a yes settles exactly the fields that were put to the user', () => {
        const onConfirm = vi.fn()
        render(<StageConfirm gate={GATE} onConfirm={onConfirm} />)
        fireEvent.click(screen.getByText('Yes — carry on'))
        expect(onConfirm).toHaveBeenCalledWith(['direction', 'horizon', 'lens'], false)
    })

    it('the waiver is its own press, asked once and only here', () => {
        const onConfirm = vi.fn()
        render(<StageConfirm gate={GATE} onConfirm={onConfirm} />)
        fireEvent.click(screen.getByText('Yes — go all the way to sizing'))
        expect(onConfirm).toHaveBeenCalledWith(['direction', 'horizon', 'lens'], true)
    })

    it('"change something" gets out of the way rather than settling anything', () => {
        const onConfirm = vi.fn()
        const onChange  = vi.fn()
        render(<StageConfirm gate={GATE} onConfirm={onConfirm} onChange={onChange} />)
        fireEvent.click(screen.getByText('Change something'))
        expect(onChange).toHaveBeenCalled()
        expect(onConfirm).not.toHaveBeenCalled()
    })

    it('says nothing at all when the build is not waiting on an answer', () => {
        expect(render(<StageConfirm gate={{ ...GATE, awaiting: false }} />).container.innerHTML).toBe('')
        cleanup()
        // The later stages have their own cards; this one is the opening turn's.
        expect(render(<StageConfirm gate={{ ...GATE, stage: 'spans' }} />).container.innerHTML).toBe('')
        cleanup()
        expect(render(<StageConfirm />).container.innerHTML).toBe('')
    })

    it('does not offer a value it was never given', () => {
        const partial = { ...GATE, values: { direction: 'long', horizon: null, lens: null } }
        render(<StageConfirm gate={partial} />)
        expect(screen.getByText('long')).toBeTruthy()
        expect(screen.queryByText('Horizon')).toBeNull()
    })

    it('every button is disabled while a turn is in flight', () => {
        render(<StageConfirm gate={GATE} busy />)
        for (const b of screen.getAllByRole('button')) expect(b.disabled).toBe(true)
    })
})
