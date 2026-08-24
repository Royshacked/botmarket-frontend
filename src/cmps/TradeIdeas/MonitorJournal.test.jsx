import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MonitorJournal } from './MonitorJournal.jsx'
import { readEntry, tidyPrices, guardLabel } from './monitorJournal.utils.js'

// The shared monitor journal. The setup pop-out used to render `JSON.stringify(entry)` because the
// renderer lived inside CallPage — these pin that ONE component now reads both monitors' entries,
// including the pre-shared-builder Talos ones that are still sitting in live docs.

afterEach(cleanup)

const AT = '2026-07-29T17:49:07.885Z'

// What Talos/Hermes write today (monitoring/monitorJournal.js).
const scheduled = {
    at: AT, reason: 'scheduled', price: 151.45, verdict: null,
    note: 'Price 151.45 is outside my zones 147.28–148.3, 145.35–147.27. No setup forming — checking back in 65m.',
    next_check_at: '2026-07-29T18:54:07.885Z',
}
// What Talos wrote BEFORE it: no prose, and the other field names.
const legacy = { at: AT, kind: 'scheduled', price: 150.25, next_at: '2026-07-29T18:54:07.885Z' }

describe('MonitorJournal', () => {
    it('renders the wake as a sentence, with its time, label and price', () => {
        render(<MonitorJournal timeline={[scheduled]} empty="nothing yet" />)

        expect(screen.getByText(/No setup forming — checking back in 65m/)).toBeTruthy()
        expect(screen.getByText('heartbeat')).toBeTruthy()
        expect(screen.getByText('@ 151.45')).toBeTruthy()
    })

    it('a LEGACY entry renders its meta row instead of a stringified object', () => {
        const { container } = render(<MonitorJournal timeline={[legacy]} empty="nothing yet" />)

        expect(screen.getByText('heartbeat')).toBeTruthy()       // `kind` read as `reason`
        expect(screen.getByText('@ 150.25')).toBeTruthy()
        expect(container.textContent).not.toMatch(/[{}]/)         // the old JSON.stringify symptom
        expect(container.querySelector('.monitor-journal__note')).toBeNull()
    })

    it('the empty state is the CALLER’s — each monitor names itself', () => {
        render(<MonitorJournal timeline={[]} empty="No monitor activity yet — Talos fills this in." />)
        expect(screen.getByText(/Talos fills this in/)).toBeTruthy()

        cleanup()
        render(<MonitorJournal timeline={null} empty="Kairos hasn’t looked yet." />)
        expect(screen.getByText(/Kairos hasn’t looked yet/)).toBeTruthy()
    })

    it('an assessment shows the verdict and the model’s own read', () => {
        const entry = {
            at: AT, reason: 'zone_trip', price: 147.9, verdict: 'stand_aside',
            note: 'In the zone but the tape is risk-off.', zone_id: 'ez1',
        }
        render(<MonitorJournal timeline={[entry]} empty="x" />)

        expect(screen.getByText('stand_aside')).toBeTruthy()
        expect(screen.getByText(/tape is risk-off/)).toBeTruthy()
        expect(screen.getByText('in zone')).toBeTruthy()
    })

    it('axes are Hermes-only — shown when supplied, absent (not empty) when not', () => {
        const withAxes = {
            at: AT, reason: 'zone_trip', verdict: 'wait', note: 'coiling', fetched: 'chart 15min',
            axes: { market: { read: 'tape is calm', score: 'neutral' }, patterns_seen: [] },
        }
        const { container, rerender } = render(<MonitorJournal timeline={[withAxes]} empty="x" />)
        expect(screen.getByText('market')).toBeTruthy()
        expect(screen.getByText('fetched chart 15min')).toBeTruthy()
        // The axis read is collapsed until asked for — the journal stays scannable.
        expect(screen.queryByText(/tape is calm/)).toBeNull()
        fireEvent.click(screen.getByText('market'))
        expect(screen.getByText(/tape is calm/)).toBeTruthy()

        rerender(<MonitorJournal timeline={[{ at: AT, reason: 'zone_trip', note: 'no axes here' }]} empty="x" />)
        expect(container.querySelector('.monitor-journal__axes')).toBeNull()
    })

    it('the renamed market-closed wake and its legacy spelling read identically', () => {
        // Server-side `closed` became `market_closed` because it read as "the position closed"
        // while it means "the market is shut". Entries written before the rename are still in live
        // docs — if only the new key were labelled, they would render as the raw slug.
        const { rerender } = render(
            <MonitorJournal timeline={[{ at: AT, reason: 'market_closed', note: 'holding' }]} empty="x" />)
        expect(screen.getByText('market closed')).toBeTruthy()

        rerender(<MonitorJournal timeline={[{ at: AT, reason: 'closed', note: 'holding' }]} empty="x" />)
        expect(screen.getByText('market closed')).toBeTruthy()
    })

    it('an exit is labelled as the position closing, not as the market closing', () => {
        // The two are opposite events and used to share a word. A raw `exit` slug leaking into the
        // journal is how we would find out the label map was missed.
        render(<MonitorJournal timeline={[{ at: AT, reason: 'exit', note: 'Out of AER at 151.45' }]} empty="x" />)
        expect(screen.getByText('closed out')).toBeTruthy()
        expect(screen.queryByText('exit')).toBeNull()
    })

    it('a caller can label the wake kinds only IT produces', () => {
        const entry = { at: AT, reason: 'in_position', note: 'trailing the stop' }
        render(<MonitorJournal timeline={[entry]} empty="x" reasonLabels={{ in_position: 'managing' }} />)
        expect(screen.getByText('managing')).toBeTruthy()
    })

    it('renders the whole run oldest→newest', () => {
        const { container } = render(<MonitorJournal timeline={[legacy, scheduled]} empty="x" />)
        const entries = container.querySelectorAll('.monitor-journal__entry')
        expect(entries.length).toBe(2)
        expect(entries[0].textContent).toMatch(/150.25/)
        expect(entries[1].textContent).toMatch(/151.45/)
    })
})

describe('readEntry', () => {
    it('reads both vocabularies, and never invents a reason', () => {
        expect(readEntry(scheduled).reason).toBe('scheduled')
        expect(readEntry(legacy).reason).toBe('scheduled')
        expect(readEntry({ read: 'model words' }).note).toBe('model words')   // old Talos field
        expect(readEntry({}).reason).toBe('wake')
        expect(readEntry(null).note).toBe(null)
    })
})

describe('tidyPrices', () => {
    it('shortens the model’s over-precise floats without touching clean numbers', () => {
        expect(tidyPrices('price 154.2100067138672 held')).toBe('price 154.21 held')
        expect(tidyPrices('0.123456789 on the cross')).toMatch(/0\.123457/)
        expect(tidyPrices('33.24 and 4.5% and 12')).toBe('33.24 and 4.5% and 12')
        expect(tidyPrices('')).toBe('')
        expect(tidyPrices(null)).toBe(null)
    })
})

// ── The guard line (docs/desks/talos-guards.md) ──────────────────────────────

describe('the guard row', () => {
    it('says which line fired, that it was armed earlier, and what is watched now', () => {
        // The audit trail. `armed_at` is the point of rendering `fired` at all — it is the
        // difference between "a level was stumbled into" and "I drew this line and price came to it".
        const { container } = render(<MonitorJournal timeline={[{
            at: '2026-08-22T11:47:00.000Z', reason: 'guard_price', price: 312.4, verdict: 'wait',
            note: 'Tagged it, but the candle is still open.',
            fired: { price: 312, direction: 'above', means: 'entry', armed_at: '2026-08-22T08:20:00.000Z' },
            armed: [{ after_min: null, price: 318, direction: 'above' }, { after_min: 240, price: null }],
            skipped: 9,
        }]} />)

        // Read off the row's own text: the pieces sit in separate spans so they can be styled apart,
        // which is exactly the case a text matcher cannot span.
        const row = container.querySelector('.monitor-journal__guards').textContent
        expect(row).toContain('↑312')
        expect(row).toContain('entry')
        expect(row).toContain('armed')                                  // …at 08:20, in the viewer's zone
        expect(row).toContain('9 timer wakes passed without a look')
        expect(row).toContain('watching ↑318 · in 240m')
    })

    it('renders a pre-guard entry exactly as it always did', () => {
        // Live documents are full of these. The backend OMITS the guard fields rather than nulling
        // them, so the row must simply not appear — not appear empty.
        const { container } = render(<MonitorJournal timeline={[{
            at: '2026-08-22T11:47:00.000Z', reason: 'zone_trip', price: 312, note: 'In the zone.',
        }]} />)
        expect(screen.getByText('In the zone.')).toBeTruthy()
        expect(container.querySelector('.monitor-journal__guards')).toBeNull()
    })

    it('marks a touch guard differently from a directional one — it has no side to pick', () => {
        render(<MonitorJournal timeline={[{
            at: '2026-08-22T11:47:00.000Z', reason: 'guard_price',
            fired: { price: 238, direction: 'any', means: 'entry' },
        }]} />)
        expect(screen.getByText(/@238/)).toBeTruthy()
    })
})

describe('guardLabel', () => {
    it('reads an ABSENT price as absent, never as a level at zero', () => {
        // `Number(null)` is 0 and 0 is finite, so the naive read renders the unconditional backstop
        // — which carries no price at all — as "↑0 after 240m". Caught by a rendering assertion, not
        // by a type: the same trap the backend's num() helper exists for.
        expect(guardLabel({ after_min: 240, price: null })).toBe('in 240m')
        expect(guardLabel({ after_min: 240 })).toBe('in 240m')
    })

    it('shows both halves of a conjunction, or it reads as an immediate interrupt', () => {
        expect(guardLabel({ after_min: 30, price: 305, direction: 'above' })).toBe('↑305 after 30m')
        expect(guardLabel({ after_min: null, price: 305, direction: 'above' })).toBe('↑305')
    })

    it('marks direction, and gives a touch its own mark rather than picking a side', () => {
        expect(guardLabel({ price: 305, direction: 'below' })).toBe('↓305')
        expect(guardLabel({ price: 305, direction: 'any' })).toBe('@305')
    })

    it('has nothing to say about a guard with neither term', () => {
        expect(guardLabel({})).toBeNull()
        expect(guardLabel(null)).toBeNull()
    })
})
