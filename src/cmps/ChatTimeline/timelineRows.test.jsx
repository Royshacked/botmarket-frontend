import { describe, it, expect } from 'vitest'
import { isOffScreen } from './timelineRows.js'

// One voice (docs/design/axl-one-voice.md §5, Roy 2026-11-21): a specialist's answer to Axl is his MATERIAL — kept in the
// session, never drawn; Axl writes the reply. A chart it drew is its own Axl row, and stays.
describe('the rows the chat does not draw', () => {
    it('hides a specialist\'s material, keeps an older specialist row and the chart row', () => {
        expect(isOffScreen({ agent: 'echo', role: 'assistant', content: 'Broadcom scores 9.', ref: { via: 'axl', material: true } })).toBe(true)
        expect(isOffScreen({ agent: 'echo', role: 'assistant', content: 'an answer from before 2026-11-21', ref: { via: 'axl' } })).toBe(false)
        expect(isOffScreen({ agent: 'axl', role: 'assistant', content: "Here's the TSLA daily chart.", ref: { chart: { ticker: 'TSLA', timeframe: 'day' } } })).toBe(false)
        expect(isOffScreen({ agent: 'echo', role: 'user', content: 'the question', ref: { opening: true, via: 'axl' } })).toBe(true)
    })
})
