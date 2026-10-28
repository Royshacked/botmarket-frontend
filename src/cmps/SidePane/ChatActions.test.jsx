import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'

// A desk's buttons under the chat, on a phone, while its sheet is down (Roy, 2026-10-28: "the buttons of generate,
// update and so on — they should appear at the bottom of the chat box when enabled"; phone only).

let handheld = false
vi.mock('../EntityCard/entityPopup.js', () => ({ isHandheld: () => handheld }))

const { ChatActions, ChatActionSlot } = await import('./ChatActions.jsx')
const { _resetSidePane, openSurface, expandPane, collapsePane } = await import('./sidePane.store.js')

const Bar = () => (
    <ChatActions>
        <div className="portfolio-panel__action-bubble desk-surface__bar" data-testid="bar">
            <button className="portfolio-panel__review-btn portfolio-panel__review-btn--update">Generate setup</button>
        </div>
    </ChatActions>
)
const Page = () => (
    <>
        <section data-testid="surface"><Bar /></section>
        <footer data-testid="chat"><ChatActionSlot /></footer>
    </>
)

beforeEach(() => { handheld = false; _resetSidePane() })
afterEach(cleanup)

describe('ChatActions', () => {
    it('a phone with the sheet down: the bar sits in the chat, above the input', () => {
        handheld = true
        act(() => openSurface('mentor', { follow: true, collapse: true }))
        render(<Page />)
        expect(screen.getByTestId('chat').contains(screen.getByTestId('bar'))).toBe(true)
        expect(screen.getByTestId('surface').contains(screen.getByTestId('bar'))).toBe(false)
    })

    it('the sheet raised, it goes back to the surface — the sheet covers the chat; lowered again, back under the chat', () => {
        handheld = true
        act(() => openSurface('mentor', { follow: true, collapse: true }))
        render(<Page />)
        act(() => expandPane())
        expect(screen.getByTestId('surface').contains(screen.getByTestId('bar'))).toBe(true)
        act(() => collapsePane())
        expect(screen.getByTestId('chat').contains(screen.getByTestId('bar'))).toBe(true)
    })

    it('a desktop: the bar stays in the surface, whatever the pane', () => {
        act(() => openSurface('mentor', { follow: true }))
        render(<Page />)
        expect(screen.getByTestId('surface').contains(screen.getByTestId('bar'))).toBe(true)
        expect(screen.getByRole('button', { name: 'Generate setup' })).toBeTruthy()
    })
})
