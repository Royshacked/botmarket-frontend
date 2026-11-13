import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { BehaviourProvider, BehaviourBadge } from './BehaviourBadge.jsx'

// The Hotlist badge (backend proteus.md step 5): what a name obeys, beside its ticker; a click opens the technical
// analyst's read. Many rows → one request per horizon.

afterEach(cleanup)

const BADGES = {
    NVDA: { badge: '50 MA +1', holds: ['50 MA (daily)', 'sweeps lows (weekly)'], tip: 'Measured on the daily and weekly bars, it holds at: 50 MA (daily). Click for the read.' },
    TSLA: { badge: 'nothing', holds: [], tip: 'nothing technical holds' },
    AMD: null,
}

describe('BehaviourBadge', () => {
    it('a list asks ONCE per horizon, shows what each name obeys, "nothing" dimmed, and none for a name not profiled yet', async () => {
        const fetch = vi.fn(async (symbols) => Object.fromEntries(symbols.map(s => [s, BADGES[s] ?? null])))
        render(
            <BehaviourProvider _fetch={fetch}>
                {['nvda', 'TSLA', 'AMD'].map(s => <BehaviourBadge key={s} symbol={s} horizon="swing" />)}
                <BehaviourBadge symbol="NVDA" horizon="intraday" />
            </BehaviourProvider>,
        )
        await waitFor(() => expect(screen.getAllByText('50 MA +1')).toHaveLength(2))
        expect(fetch).toHaveBeenCalledTimes(2)
        expect(fetch.mock.calls.map(([s, h]) => [s.slice().sort(), h]).sort((a, b) => a[1].localeCompare(b[1])))
            .toEqual([[['NVDA'], 'intraday'], [['AMD', 'NVDA', 'TSLA'], 'swing']])
        expect(screen.getByText('nothing').className).toContain('behaviour-badge--nothing')
        expect(screen.getAllByText('50 MA +1')[0].getAttribute('title')).toMatch(/Click for the read/)
        expect(screen.queryByLabelText(/How it trades/, { selector: '[aria-label="How it trades: null"]' })).toBeNull()
    })

    it('a click opens the read for that name — and does not also click the row under it', async () => {
        const onOpen = vi.fn(), onRow = vi.fn()
        render(
            <BehaviourProvider _fetch={async () => ({ NVDA: BADGES.NVDA })} onOpen={onOpen}>
                <div onClick={onRow}><BehaviourBadge symbol="nvda" horizon="swing" /></div>
            </BehaviourProvider>,
        )
        fireEvent.click(await screen.findByRole('button', { name: 'How it trades: 50 MA +1' }))
        expect(onOpen).toHaveBeenCalledWith('NVDA')
        expect(onRow).not.toHaveBeenCalled()
    })

    it('outside a provider, or with no badge source, nothing is asked and nothing shows', async () => {
        render(<BehaviourBadge symbol="NVDA" horizon="swing" />)
        render(<BehaviourProvider _fetch={undefined}><BehaviourBadge symbol="NVDA" horizon="swing" /></BehaviourProvider>)
        await new Promise(r => setTimeout(r, 10))
        expect(screen.queryByText(/MA|nothing/)).toBeNull()
    })
})
