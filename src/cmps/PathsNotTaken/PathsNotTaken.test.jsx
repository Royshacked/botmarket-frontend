import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { PathsNotTaken } from './PathsNotTaken.jsx'

afterEach(cleanup)

// What a plan is NOT — the ways in that were rejected, and what has been thrown at the direction.
// Mirrors the backend's `alternatives[]` and `challenges[]` (setup.schema.js).

const ALTS = [
    { archetype: 'sweep_reclaim', price: 232.4, why_not: 'the pool sits under the shelf, so the entry is below my stop' },
    { archetype: 'gap_fill',      price: null,  why_not: 'the gap is below my invalidation' },
]

describe('PathsNotTaken', () => {
    it('renders NOTHING when there is nothing to say', () => {
        // The ordinary case twice over: a plan the user brought (they chose the way in, so nothing
        // was rejected) and a plan nobody has attacked. An empty frame would be a reproach.
        const { container } = render(<PathsNotTaken />)
        expect(container.firstChild).toBeNull()

        cleanup()
        const { container: c2 } = render(<PathsNotTaken alternatives={[]} challenges={[]} />)
        expect(c2.firstChild).toBeNull()
    })

    it('names each rejected way in, its level and the reason', () => {
        render(<PathsNotTaken alternatives={ALTS} />)
        expect(screen.getByText('sweep reclaim')).toBeTruthy()
        expect(screen.getByText('232.4')).toBeTruthy()
        expect(screen.getByText(/the pool sits under the shelf/)).toBeTruthy()
        // A way in that was never at a level is still a rejected way in.
        expect(screen.getByText('gap fill')).toBeTruthy()
        expect(screen.getByText(/the gap is below my invalidation/)).toBeTruthy()
    })

    it('drops a reject with no reason — the reason IS the record', () => {
        // The server drops these on the way in; a draft held by an older client could still carry
        // one, and an archetype on its own proves nothing about whether anybody looked.
        render(<PathsNotTaken alternatives={[{ archetype: 'breakout' }, ...ALTS]} />)
        expect(screen.queryByText('breakout')).toBeNull()
        expect(screen.getByText('sweep reclaim')).toBeTruthy()
    })

    it('shows the newest verdict first, with what it means', () => {
        render(<PathsNotTaken challenges={[
            { pass: 'flip', verdict: 'stands',    at: '2026-09-20T10:00:00.000Z' },
            { pass: 'flip', verdict: 'two_sided', at: '2026-09-26T10:00:00.000Z' },
        ]} />)
        const chips = screen.getAllByText(/Direction attacked/)
        expect(chips).toHaveLength(2)
        // Newest LAST in the data (the server appends), so the newest reads first here: an older
        // verdict is about levels that have since moved.
        expect(chips[0].textContent).toMatch(/two-sided/)
        expect(chips[1].textContent).toMatch(/stands/)
        expect(chips[0].getAttribute('title')).toMatch(/both directions/)
    })

    it('ignores a verdict this build does not understand', () => {
        // Rendering a raw id would put a word in front of the user that nothing explains, and imply
        // the plan was judged in a way this client cannot describe.
        render(<PathsNotTaken challenges={[{ pass: 'flip', verdict: 'inconclusive' }]} alternatives={ALTS} />)
        expect(screen.queryByText(/Direction attacked/)).toBeNull()
        expect(screen.getByText('sweep reclaim')).toBeTruthy()
    })

    it('an archetype this build has not heard of still reads as words', () => {
        // The backend can grow a ninth way in before this client does. The honest fallback is the id
        // with its underscores opened out and no tooltip — never a blank, never a crash.
        render(<PathsNotTaken alternatives={[{ archetype: 'liquidity_grab', why_not: 'no clean invalidation' }]} />)
        const name = screen.getByText('liquidity grab')
        expect(name).toBeTruthy()
        expect(name.getAttribute('title')).toBeNull()
    })
})
