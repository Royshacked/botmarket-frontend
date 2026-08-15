import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, renderHook, act } from '@testing-library/react'
import { ChatReasoning } from './ChatReasoning.jsx'
import { appendReasoning, toReasoningSegments } from '../services/reasoning.service.js'
import { useChatStream } from '../customHooks/useChatStream.js'

// A turn can contain the thinking of TWO models: the desk's own, and the reasoning sidecar it
// consults for one bounded decision. They share one block and one SSE event, told apart by a label
// — so what these tests protect is that the label survives the trip and still renders as a
// different voice at the end of it. Collapse the two together and a second model's advice reads as
// the desk contradicting itself mid-sentence.

afterEach(cleanup)

describe('reasoning accumulates as segments, not one string', () => {
    it('coalesces a run from the same thinker', () => {
        // Deltas arrive many per second; a turn has a handful of segments. Coalescing is what keeps
        // this O(segments) instead of rebuilding the transcript on every delta.
        let segs = null
        segs = appendReasoning(segs, 'desk', 'we')
        segs = appendReasoning(segs, 'desk', 'igh')
        expect(segs).toEqual([{ source: 'desk', text: 'weigh' }])
    })

    it('opens a new segment when the thinker changes, keeping the order', () => {
        let segs = appendReasoning(null, 'desk', 'sizing this')
        segs = appendReasoning(segs, 'consult', 'the stop is wide')
        segs = appendReasoning(segs, 'desk', 'agreed')
        expect(segs.map(s => s.source)).toEqual(['desk', 'consult', 'desk'])
        expect(segs[2].text).toBe('agreed')
    })

    it('never mutates the list it was given', () => {
        const before = appendReasoning(null, 'desk', 'a')
        const after = appendReasoning(before, 'desk', 'b')
        expect(before).toEqual([{ source: 'desk', text: 'a' }])
        expect(after).not.toBe(before)
    })
})

describe('the empty value stays falsy', () => {
    it('is null before anything is thought, so a wordless turn draws no block', () => {
        // Every caller writes `...(reasoning ? { reasoning } : {})` and `!msg.reasoning`. An empty
        // ARRAY is truthy, so `[]` here would give every wordless turn a blank reasoning box.
        const { result } = renderHook(() => useChatStream())
        expect(result.current.reasoningRef.current).toBe(null)
    })

    it('holds labelled segments once deltas arrive', () => {
        const { result } = renderHook(() => useChatStream())
        act(() => { result.current.begin('hi', { onDone: () => {} }) })
        const { handlers } = result.current.begin('hi', { onDone: () => {} })
        act(() => {
            handlers.onReasoning('thinking', 'desk')
            handlers.onReasoning('advising', 'consult')
        })
        expect(result.current.reasoningRef.current).toEqual([
            { source: 'desk',    text: 'thinking' },
            { source: 'consult', text: 'advising' },
        ])
    })

    it('defaults an untagged delta to the desk', () => {
        // A server that predates the label still renders rather than going blank.
        const { result } = renderHook(() => useChatStream())
        const { handlers } = result.current.begin('hi', { onDone: () => {} })
        act(() => { handlers.onReasoning('thinking') })
        expect(result.current.reasoningRef.current).toEqual([{ source: 'desk', text: 'thinking' }])
    })
})

describe('the two voices render apart', () => {
    const mixed = [
        { source: 'desk',    text: 'entry looks fine' },
        { source: 'consult', text: 'size at 1.2%' },
    ]

    it('gives the sidecar its own class so it can carry its own type', () => {
        const { container } = render(<ChatReasoning reasoning={mixed} live />)
        expect(container.querySelectorAll('.chat-reasoning__seg--desk')).toHaveLength(1)
        expect(container.querySelector('.chat-reasoning__seg--consult').textContent).toContain('size at 1.2%')
    })

    it('announces the consult while collapsed', () => {
        // Closed, the badge is the ONLY sign a second model was involved.
        const { container } = render(<ChatReasoning reasoning={mixed} />)
        expect(container.querySelector('details').open).toBe(false)
        expect(container.querySelector('.chat-reasoning__badge').textContent).toBe('consulted')
    })

    it('counts more than one consult', () => {
        const { container } = render(<ChatReasoning reasoning={[...mixed, { source: 'consult', text: 'and again' }]} />)
        expect(container.querySelector('.chat-reasoning__badge').textContent).toBe('2 consults')
    })

    it('shows no badge when only the desk thought', () => {
        const { container } = render(<ChatReasoning reasoning={[{ source: 'desk', text: 'just me' }]} />)
        expect(container.querySelector('.chat-reasoning__badge')).toBeNull()
    })
})

const mixedTail = [
    { source: 'desk',    text: 'entry looks fine' },
    { source: 'consult', text: 'size at 1.2%' },
]

describe('the sidecar is not hidden behind a collapsed toggle', () => {
    it('opens while the sidecar is the one speaking', () => {
        // A consult happens during a tool call — AFTER the desk has usually written something, and
        // any answer text has already collapsed the block. Without this the second model thinks for
        // seconds behind a closed toggle, which is the whole thing we set out to surface.
        const { container } = render(<ChatReasoning reasoning={mixedTail} streaming />)
        expect(container.querySelector('details').open).toBe(true)
    })

    it('closes again once the desk resumes', () => {
        const resumed = [...mixedTail, { source: 'desk', text: 'agreed, sizing now' }]
        const { container } = render(<ChatReasoning reasoning={resumed} streaming />)
        expect(container.querySelector('details').open).toBe(false)
    })

    it('does not re-open a finished turn that happened to end on a consult', () => {
        const { container } = render(<ChatReasoning reasoning={mixedTail} streaming={false} />)
        expect(container.querySelector('details').open).toBe(false)
    })
})

describe('history written before segments existed still renders', () => {
    it('reads a persisted string as one desk segment', () => {
        expect(toReasoningSegments('old flat reasoning')).toEqual([{ source: 'desk', text: 'old flat reasoning' }])
    })

    it('draws nothing at all for an absent or empty value', () => {
        expect(toReasoningSegments(null)).toEqual([])
        expect(render(<ChatReasoning reasoning={[]} />).container.querySelector('details')).toBeNull()
        cleanup()
        expect(render(<ChatReasoning reasoning={[{ source: 'desk', text: '' }]} />).container.querySelector('details')).toBeNull()
    })
})
