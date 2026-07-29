import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MonitorJournal } from './MonitorJournal.jsx'
import { readEntry, tidyPrices } from './monitorJournal.utils.js'

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
