import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { TechnicalsProvider, TechnicalProfile } from './TechnicalProfile.jsx'

// How it trades — the technical analyst's profile in an opened Hotlist row (backend proteus.md §8.1, 2026-11-13; it
// replaced the row badge).

afterEach(cleanup)

const PROFILE = {
    symbol: 'NVDA', horizon: 'swing', computed_at: '2026-11-13T01:00:00Z',
    headline: { text: 'fakes 77%', kind: 'trait' },
    lines: [['What it obeys', 'Nothing technical holds on the daily and weekly bars.'], ['ATR', 'Daily 2.99% · Weekly 7.47%']],
}

describe('TechnicalProfile', () => {
    it('measures, then shows the row\'s horizon as lines, with the headline and the date it was measured', async () => {
        const fetch = vi.fn(async () => PROFILE)
        render(<TechnicalProfile symbol="NVDA" horizon="swing" _fetch={fetch} />)
        expect(screen.getByText(/Measuring how NVDA trades/)).toBeTruthy()
        expect(await screen.findByText('Nothing technical holds on the daily and weekly bars.')).toBeTruthy()
        expect(fetch).toHaveBeenCalledWith('NVDA', 'swing')
        expect(screen.getByText('fakes 77%').className).toContain('hot-profile__headline--trait')
        expect(screen.getByText('What it obeys').tagName).toBe('DT')
        expect(screen.getByText(/Measured 2026-11-13/)).toBeTruthy()
    })

    it('a name that cannot be measured says why; a failed read says so — never a blank', async () => {
        render(<TechnicalProfile symbol="ZZZ" horizon="intraday" _fetch={async () => ({ reason: 'too_short' })} />)
        expect(await screen.findByText(/Not enough history on this horizon/)).toBeTruthy()
        cleanup()
        render(<TechnicalProfile symbol="ZZZ" horizon="swing" _fetch={async () => { throw new Error('500') }} />)
        expect(await screen.findByText(/could not be read just now/)).toBeTruthy()
    })

    it('"Ask the technical analyst" opens his read for the name — only where the Hotlist provides the opener', async () => {
        const onAsk = vi.fn()
        render(<TechnicalsProvider onAsk={onAsk}><TechnicalProfile symbol="nvda" horizon="swing" _fetch={async () => PROFILE} /></TechnicalsProvider>)
        fireEvent.click(await screen.findByRole('button', { name: 'Ask the technical analyst' }))
        expect(onAsk).toHaveBeenCalledWith('NVDA')
        cleanup()
        render(<TechnicalProfile symbol="NVDA" horizon="swing" _fetch={async () => PROFILE} />)
        await screen.findByText('fakes 77%')
        expect(screen.queryByRole('button', { name: 'Ask the technical analyst' })).toBeNull()
    })
})
