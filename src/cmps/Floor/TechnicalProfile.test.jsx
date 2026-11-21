import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { TechnicalsProvider, TechnicalProfile } from './TechnicalProfile.jsx'
import { HotlistRowPage } from './HotlistRowPage.jsx'

vi.mock('../PriceChart/ChartSurface.jsx', () => ({ ChartSurface: () => null }))
vi.mock('../OwnedBadge/OwnedBadge.jsx', () => ({ OwnedBadge: () => null }))

// How it trades — the technical analyst's profile in an opened Hotlist row (backend proteus.md §8.1, 2026-11-13), in
// BOTTOM LINES since 2026-11-21 (Roy: "very long stories — I want bottom lines and a chat button").

afterEach(cleanup)

const PROFILE = {
    symbol: 'NVDA', horizon: 'swing', computed_at: '2026-11-13T01:00:00Z',
    headline: { text: 'fakes 77%', kind: 'trait' },
    lines: [['What it obeys', 'Nothing technical holds on the daily and weekly bars.'], ['ATR', 'Daily 2.99% · Weekly 7.47%'], ['Daily cycle', 'No regular cycle.']],
}

describe('TechnicalProfile', () => {
    it('measures, then shows the headline and the ONE line on what it obeys — the rest is the chat\'s', async () => {
        const fetch = vi.fn(async () => PROFILE)
        render(<TechnicalProfile symbol="NVDA" horizon="swing" _fetch={fetch} />)
        expect(screen.getByText(/Measuring how NVDA trades/)).toBeTruthy()
        expect(await screen.findByText('Nothing technical holds on the daily and weekly bars.')).toBeTruthy()
        expect(fetch).toHaveBeenCalledWith('NVDA', 'swing')
        expect(screen.getByText('fakes 77%').className).toContain('hot-profile__headline--trait')
        expect(screen.queryByText(/No regular cycle/)).toBeNull()
        expect(screen.queryByText(/Daily 2\.99%/)).toBeNull()
    })

    it('a name that cannot be measured says why; a failed read says so — never a blank', async () => {
        render(<TechnicalProfile symbol="ZZZ" horizon="intraday" _fetch={async () => ({ reason: 'too_short' })} />)
        expect(await screen.findByText(/Not enough history on this horizon/)).toBeTruthy()
        cleanup()
        render(<TechnicalProfile symbol="ZZZ" horizon="swing" _fetch={async () => { throw new Error('500') }} />)
        expect(await screen.findByText(/could not be read just now/)).toBeTruthy()
        cleanup()
        render(<TechnicalProfile symbol="LLY" horizon="swing" _fetch={async () => ({ reason: 'unavailable' })} />)
        expect(await screen.findByText(/could not be fetched just now/)).toBeTruthy()
    })
})

describe('a row\'s page — Chat about it', () => {
    it('hands the name to Axl where the Hotlist provides the opener; nothing without it', async () => {
        const onChat = vi.fn()
        render(<TechnicalsProvider onChat={onChat}><HotlistRowPage symbol="ORCL" name="Oracle Corporation" /></TechnicalsProvider>)
        fireEvent.click(screen.getByRole('button', { name: 'Chat about it' }))
        expect(onChat).toHaveBeenCalledWith('ORCL', 'Oracle Corporation')
        cleanup()
        render(<HotlistRowPage symbol="ORCL" />)
        expect(screen.queryByRole('button', { name: 'Chat about it' })).toBeNull()
    })
})
