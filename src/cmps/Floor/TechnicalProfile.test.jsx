import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { TechnicalsProvider, TechnicalProfile } from './TechnicalProfile.jsx'
import { HotlistRowPage } from './HotlistRowPage.jsx'

vi.mock('../PriceChart/ChartSurface.jsx', () => ({ ChartSurface: () => null }))
vi.mock('../OwnedBadge/OwnedBadge.jsx', () => ({ OwnedBadge: () => null }))

// How it trades — the house's measured profile in an opened Hotlist row, in bottom lines (backend proteus-v2.md §5,
// 2026-11-21): how far it moves, its natural levels and how often they worked, trend or revert.

afterEach(cleanup)

const PROFILE = {
    symbol: 'NVDA', horizon: 'swing', computed_at: '2026-11-13T01:00:00Z',
    headline: { text: 'Trends · σ 13.9% a month', kind: 'persists' },
    lines: [['Moves', 'σ 13.9% a month; runs ~31.4%, pullbacks ~16.2%'], ['Levels', 'stop ~21.1%, target ~21.2% (1:1.0) — target first 70%, ~35 sessions'], ['Trend', 'steep moves carry on; now down trend']],
}

describe('TechnicalProfile', () => {
    it('measures, then shows the headline and its bottom lines — each labelled', async () => {
        const fetch = vi.fn(async () => PROFILE)
        render(<TechnicalProfile symbol="NVDA" horizon="swing" _fetch={fetch} />)
        expect(screen.getByText(/Measuring how NVDA trades/)).toBeTruthy()
        expect(await screen.findByText(/runs ~31\.4%/)).toBeTruthy()
        expect(fetch).toHaveBeenCalledWith('NVDA', 'swing')
        expect(screen.getByText('Trends · σ 13.9% a month').className).toContain('hot-profile__headline--persists')
        for (const label of ['Moves', 'Levels', 'Trend']) expect(screen.getByText(label).tagName).toBe('DT')
        expect(screen.getByText(/target first 70%/)).toBeTruthy()
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
