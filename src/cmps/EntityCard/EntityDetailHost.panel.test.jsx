import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { BrowserRouter } from 'react-router'

// An entity page opened from INSIDE a full-screen DetailPanel (a phone: "open" on an events-radar name's setup).
// It used to land UNDER the panel, and the two history mechanisms stacked two entries (code review 2026-10-13).
// The real browser router here, not a memory one: the bug was in the history entries.

vi.mock('./entityPopup.js', async (orig) => ({ ...(await orig()), isHandheld: () => true }))
vi.mock('../../pages/SetupPage.jsx', () => ({
    SetupPage: ({ entityId, onClose }) => (
        <div>
            <span data-testid="page">setup:{entityId}</span>
            <button onClick={onClose}>close</button>
        </div>
    ),
}))
vi.mock('../../pages/IdeaPage.jsx', () => ({ IdeaPage: () => null }))
vi.mock('../../pages/CoveragePage.jsx', () => ({ CoveragePage: () => null }))

const { EntityDetailHost } = await import('./EntityDetailHost.jsx')
const { DetailPanel } = await import('../DetailPanel/DetailPanel.jsx')
const { openPanel, closePanel, activePanel } = await import('../DetailPanel/detailPanel.store.js')
const { eventBus, ENTITY_DETAIL_OPEN } = await import('../../services/event-bus.service')

const ID = 'aether:run1|LITE'
const tick = (ms = 30) => act(() => new Promise(r => setTimeout(r, ms)))

afterEach(() => { closePanel(); cleanup(); window.history.replaceState({}, '', '/') })

describe('an entity page opened from a full-screen panel', () => {
    it('takes the panel\'s place: the panel closes, its history entry is replaced, one back leaves the page', async () => {
        window.history.replaceState({}, '', '/')
        render(
            <BrowserRouter>
                <DetailPanel id={ID} title="LITE"><p>the name&apos;s evidence</p></DetailPanel>
                <EntityDetailHost />
            </BrowserRouter>,
        )
        await act(async () => { openPanel(ID) })
        expect(document.querySelector('.detail-panel--page')).not.toBeNull()
        expect(window.history.state?.detailPanel).toBe(ID)
        const depth = window.history.length

        await act(async () => { eventBus.emit(ENTITY_DETAIL_OPEN, { kind: 'setup', id: 's1' }) })
        await tick()

        expect(screen.getByTestId('page').textContent).toBe('setup:s1')
        expect(activePanel()).toBeNull()
        expect(document.querySelector('.detail-panel')).toBeNull()
        expect(window.history.length).toBe(depth)                    // replaced, not stacked
        expect(window.history.state?.detailPanel).toBeUndefined()
        expect(window.location.search).toMatch(/setup/)

        await act(async () => { fireEvent.click(screen.getByText('close')) })
        await tick()
        expect(screen.queryByTestId('page')).toBeNull()
        expect(window.location.search).not.toMatch(/setup/)
    })

    it('with no panel open, the page opens and closes as before', async () => {
        window.history.replaceState({}, '', '/')
        render(<BrowserRouter><EntityDetailHost /></BrowserRouter>)
        await act(async () => { eventBus.emit(ENTITY_DETAIL_OPEN, { kind: 'setup', id: 's2' }) })
        expect(screen.getByTestId('page').textContent).toBe('setup:s2')
        expect(window.location.search).toMatch(/setup/)
        await act(async () => { fireEvent.click(screen.getByText('close')) })
        await tick()
        expect(screen.queryByTestId('page')).toBeNull()
        expect(window.location.search).toBe('')
    })
})
