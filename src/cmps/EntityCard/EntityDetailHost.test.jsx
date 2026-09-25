import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

// The pages themselves are charts, journals and live polls — none of that is what this file is
// about. Stubbed down to "which entity am I, and how do I leave", which IS the contract the host
// holds: it hands each page its id and the way back.
vi.mock('../../pages/SetupPage.jsx', () => ({
    SetupPage: ({ entityId, onClose }) => (
        <div>
            <span data-testid="page">setup:{entityId}</span>
            <button onClick={onClose}>close</button>
        </div>
    ),
}))
vi.mock('../../pages/IdeaPage.jsx', () => ({
    IdeaPage: ({ entityId, onClose }) => (
        <div>
            <span data-testid="page">idea:{entityId}</span>
            <button onClick={onClose}>close</button>
        </div>
    ),
}))

const { EntityDetailHost } = await import('./EntityDetailHost.jsx')
const { eventBus, ENTITY_DETAIL_OPEN } = await import('../../services/event-bus.service')

// The host reads `window.location` for the LIVE url (its listener is registered once), so the
// router's memory and the window have to agree.
function renderAt(path = '/') {
    window.history.replaceState({}, '', path)
    return render(<MemoryRouter initialEntries={[path]}><EntityDetailHost /></MemoryRouter>)
}

const open = (kind, id) => act(() => { eventBus.emit(ENTITY_DETAIL_OPEN, { kind, id }) })

afterEach(() => { cleanup(); window.history.replaceState({}, '', '/') })
beforeEach(() => { vi.clearAllMocks() })

describe('EntityDetailHost', () => {
    it('renders nothing until something asks — a desktop never mounts a page it did not open', () => {
        const { container } = renderAt('/')
        expect(container.firstChild).toBeNull()
    })

    it('an ask opens that entity\'s page', async () => {
        renderAt('/')
        await open('setup', 's1')
        expect(screen.getByTestId('page').textContent).toBe('setup:s1')
    })

    it('closing takes the page away and leaves the app where it was', async () => {
        renderAt('/')
        await open('idea', 'i1')
        expect(screen.getByTestId('page').textContent).toBe('idea:i1')

        await act(async () => { fireEvent.click(screen.getByText('close')) })

        expect(screen.queryByTestId('page')).toBeNull()
    })

    it('a pasted link opens the page with no history behind it, and closes without leaving the app', async () => {
        // The case navigate(-1) would get wrong: there is no entry of ours to step back over, so
        // closing has to strip the param in place instead of walking out of the app.
        renderAt('/?setup=s9')
        expect(screen.getByTestId('page').textContent).toBe('setup:s9')

        await act(async () => { fireEvent.click(screen.getByText('close')) })

        expect(screen.queryByTestId('page')).toBeNull()
    })

    it('opening a second entity replaces the first — one full-screen page at a time', async () => {
        renderAt('/')
        await open('setup', 's1')
        await open('setup', 's2')
        expect(screen.getAllByTestId('page')).toHaveLength(1)
        expect(screen.getByTestId('page').textContent).toBe('setup:s2')
    })

    it('an ask for a kind with no page in the app opens nothing', async () => {
        renderAt('/')
        await open('call', 'c1')
        expect(screen.queryByTestId('page')).toBeNull()
    })

    it('an ask with no id opens nothing', async () => {
        renderAt('/')
        await open('setup', null)
        expect(screen.queryByTestId('page')).toBeNull()
    })
})
