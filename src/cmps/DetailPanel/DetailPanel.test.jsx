import { describe, it, expect, afterEach, vi } from 'vitest'
import { StrictMode, useState } from 'react'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { DetailPanel, DetailPanelSlot, SLOT_ID } from './DetailPanel.jsx'
import { activePanel, closePanel, openPanel, togglePanel, retainPanel } from './detailPanel.store.js'

// The shell every Floor list opens its item's detail in (coverage, the events radar's names,
// Pythia's industries, assessments and themes). Its content is the list's; these are the rules the
// shell owns: one open across the app, where it lands, how it closes.

const handheld = (on) => {
    window.matchMedia = on
        ? () => ({ matches: true })
        : undefined
}

afterEach(() => {
    cleanup()
    closePanel()
    handheld(false)
    vi.useRealTimers()
})

function Opener({ id, title = id, children = `body of ${id}` }) {
    return (
        <>
            <button type="button" onClick={() => togglePanel(id)}>open {id}</button>
            <DetailPanel id={id} kicker="Desk" title={title}>{children}</DetailPanel>
        </>
    )
}

describe('the store — one panel across the app', () => {
    it('opening one closes the other; toggling the open one closes it', () => {
        openPanel('a')
        expect(activePanel()).toBe('a')
        openPanel('b')
        expect(activePanel()).toBe('b')
        togglePanel('b')
        expect(activePanel()).toBeNull()
    })

    it('closing a panel that is not the open one leaves the open one alone', () => {
        openPanel('a')
        closePanel('b')
        expect(activePanel()).toBe('a')
        closePanel()
        expect(activePanel()).toBeNull()
    })

    it('a released id closes only if nothing renders it any more', () => {
        vi.useFakeTimers()
        openPanel('a')
        const release1 = retainPanel('a')
        const release2 = retainPanel('a')   // a second renderer of the same id (a remount)
        release1()
        vi.runAllTimers()
        expect(activePanel()).toBe('a')
        release2()
        vi.runAllTimers()
        expect(activePanel()).toBeNull()
    })
})

describe('DetailPanel', () => {
    it('renders nothing until its id is the open one', () => {
        render(<Opener id="x" />)
        expect(document.querySelector('.detail-panel')).toBeNull()
        fireEvent.click(screen.getByText('open x'))
        expect(screen.getByRole('dialog').textContent).toMatch(/body of x/)
        expect(document.querySelector('.detail-panel__kicker').textContent).toBe('Desk')
        expect(document.querySelector('.detail-panel__title').textContent).toBe('x')
    })

    it('two lists, one panel: opening the second closes the first', () => {
        render(<><Opener id="a" /><Opener id="b" /></>)
        fireEvent.click(screen.getByText('open a'))
        fireEvent.click(screen.getByText('open b'))
        expect(screen.getAllByRole('dialog')).toHaveLength(1)
        expect(screen.getByRole('dialog').textContent).toMatch(/body of b/)
    })

    it('docks in the chat column slot when one is mounted — a non-modal panel', () => {
        render(<><div className="workspace__chat"><DetailPanelSlot /></div><Opener id="x" /></>)
        fireEvent.click(screen.getByText('open x'))
        const panel = screen.getByRole('dialog')
        expect(panel.parentElement.id).toBe(SLOT_ID)
        expect(panel.className).toMatch(/detail-panel--docked/)
        expect(panel.getAttribute('aria-modal')).toBe('false')
    })

    it('with no slot it is a full-screen page on <body>', () => {
        render(<Opener id="x" />)
        fireEvent.click(screen.getByText('open x'))
        const panel = screen.getByRole('dialog')
        expect(panel.parentElement).toBe(document.body)
        expect(panel.className).toMatch(/detail-panel--page/)
    })

    it('a handheld gets the page even when the slot is there', () => {
        handheld(true)
        render(<><DetailPanelSlot /><Opener id="x" /></>)
        fireEvent.click(screen.getByText('open x'))
        expect(screen.getByRole('dialog').className).toMatch(/detail-panel--page/)
    })

    it('✕ and Esc close it', () => {
        render(<Opener id="x" />)
        fireEvent.click(screen.getByText('open x'))
        fireEvent.click(screen.getByRole('button', { name: 'Close' }))
        expect(screen.queryByRole('dialog')).toBeNull()

        fireEvent.click(screen.getByText('open x'))
        fireEvent.keyDown(document, { key: 'Escape' })
        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('an Esc something inside already handled does not close it', () => {
        render(<Opener id="x"><input aria-label="inner" onKeyDown={e => e.preventDefault()} /></Opener>)
        fireEvent.click(screen.getByText('open x'))
        fireEvent.keyDown(screen.getByLabelText('inner'), { key: 'Escape' })
        expect(screen.getByRole('dialog')).toBeTruthy()
    })

    it('takes focus on open and gives it back on close', () => {
        render(<Opener id="x" />)
        const opener = screen.getByText('open x')
        opener.focus()
        fireEvent.click(opener)
        expect(document.activeElement).toBe(screen.getByRole('dialog'))
        fireEvent.keyDown(document, { key: 'Escape' })
        expect(document.activeElement).toBe(opener)
    })

    it('opening another row keeps focus where that click put it', () => {
        render(<><Opener id="a" /><Opener id="b" /></>)
        const a = screen.getByText('open a'), b = screen.getByText('open b')
        a.focus()
        fireEvent.click(a)
        b.focus()             // what a real click on the second row does first
        fireEvent.click(b)
        fireEvent.keyDown(document, { key: 'Escape' })
        expect(document.activeElement).toBe(b)
    })

    it('closes with its row — reopening the list does not spring it back open', async () => {
        const { rerender } = render(<Opener id="x" />)
        fireEvent.click(screen.getByText('open x'))
        rerender(<div />)
        await act(() => new Promise(r => setTimeout(r, 0)))
        expect(activePanel()).toBeNull()
        rerender(<Opener id="x" />)
        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('survives StrictMode\'s mount–unmount–mount when it is open on mount', async () => {
        openPanel('x')
        render(<StrictMode><Opener id="x" /></StrictMode>)
        await act(() => new Promise(r => setTimeout(r, 0)))
        expect(screen.getByRole('dialog')).toBeTruthy()
    })

    it('on a handheld the back gesture closes it, and ✕ steps back over the entry it pushed', () => {
        handheld(true)
        const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
        render(<Opener id="x" />)

        fireEvent.click(screen.getByText('open x'))
        expect(window.history.state?.detailPanel).toBe('x')
        act(() => { window.dispatchEvent(new PopStateEvent('popstate')) })
        expect(screen.queryByRole('dialog')).toBeNull()
        expect(back).not.toHaveBeenCalled()

        fireEvent.click(screen.getByText('open x'))
        fireEvent.click(screen.getByRole('button', { name: 'Close' }))
        expect(back).toHaveBeenCalledTimes(1)
    })
})

// Every Floor list is a panel now (Roy, 2026-10-22): a row inside a LIST panel can open a panel of
// its own, and closing it goes back to the list — the list stays mounted under it meanwhile.
describe('a list panel and a row of it — one step back', () => {
    function ListWithRow() {
        return (
            <DetailPanel id="floor:board" title="Board" container>
                <p>the board</p>
                <Opener id="industry:451" />
            </DetailPanel>
        )
    }

    it('a row\'s panel opened from a list keeps the list mounted under it, and ✕ goes back to it', () => {
        render(<><DetailPanelSlot /><ListWithRow /></>)
        act(() => openPanel('floor:board'))
        expect(screen.getByText('the board')).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'open industry:451' }))
        expect(activePanel()).toBe('industry:451')
        expect(screen.getByText('body of industry:451')).toBeTruthy()
        expect(screen.getByText('the board').closest('[hidden]')).toBeTruthy()
        fireEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1))
        expect(activePanel()).toBe('floor:board')
        expect(screen.getByText('the board').closest('[hidden]')).toBeNull()
    })

    // Bug 2026-10-23: a theme on the board's Themes tab never opened. Going under REMOUNTED the list (its content moved
    // to another place in the tree), so the tab reset, the row unmounted, and its panel closed as it opened.
    it('the list keeps its STATE under a row\'s panel: a row on a non-default tab opens, and the tab is still there after', async () => {
        // The tab's state INSIDE the panel, as IndustryView holds it — state above the panel never saw the remount.
        function Tabs() {
            const [tab, setTab] = useState('assessed')
            return (
                <>
                    <button type="button" onClick={() => setTab('themes')}>Themes tab</button>
                    <p>tab: {tab}</p>
                    {tab === 'themes' && <Opener id="theme:th_ai" />}
                </>
            )
        }
        function TabbedBoard() {
            return <DetailPanel id="floor:board" title="Board" container><Tabs /></DetailPanel>
        }
        render(<><DetailPanelSlot /><TabbedBoard /></>)
        act(() => openPanel('floor:board'))
        fireEvent.click(screen.getByRole('button', { name: 'Themes tab' }))
        fireEvent.click(screen.getByRole('button', { name: 'open theme:th_ai' }))
        // retainPanel closes an unmounted row's panel on the next tick — wait it out, or the bug passes unseen.
        await act(() => new Promise(r => setTimeout(r, 0)))
        expect(activePanel()).toBe('theme:th_ai')
        expect(screen.getByText('body of theme:th_ai')).toBeTruthy()
        fireEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1))
        expect(activePanel()).toBe('floor:board')
        expect(screen.getByText('tab: themes')).toBeTruthy()
    })

    it('switching to another LIST is a switch, not a step: closing it goes nowhere', () => {
        render(<><DetailPanelSlot /><ListWithRow /><DetailPanel id="floor:trade" title="Trades" container>trades</DetailPanel></>)
        act(() => openPanel('floor:board'))
        act(() => openPanel('floor:trade'))
        act(() => closePanel('floor:trade'))
        expect(activePanel()).toBe(null)
    })

    it('closing everything (no id) closes the row and the list under it', () => {
        render(<><DetailPanelSlot /><ListWithRow /></>)
        act(() => openPanel('floor:board'))
        fireEvent.click(screen.getByRole('button', { name: 'open industry:451' }))
        act(() => closePanel())
        expect(activePanel()).toBe(null)
        expect(screen.queryByText('the board')).toBeNull()
    })

    it('a panel opened over a NON-list replaces it, as before', () => {
        render(<><DetailPanelSlot /><Opener id="coverage:AAPL" /><Opener id="coverage:MSFT" /></>)
        fireEvent.click(screen.getByRole('button', { name: 'open coverage:AAPL' }))
        fireEvent.click(screen.getByRole('button', { name: 'open coverage:MSFT' }))
        act(() => closePanel('coverage:MSFT'))
        expect(activePanel()).toBe(null)
    })
})

// The way back (2026-10-24): a list's hand-off leaves where it came from; opening any panel spends it.
describe('the way back to a list', () => {
    it('is set by a hand-off and spent by opening a panel', async () => {
        const store = await import('./detailPanel.store.js')
        store.setReturnTo({ panel: 'hotlist', label: 'the Hotlist' })
        expect(store.returnToPanel()).toEqual({ panel: 'hotlist', label: 'the Hotlist' })
        store.openPanel('hotlist')
        expect(store.returnToPanel()).toBeNull()
        store.closePanel()
        store.setReturnTo({ label: 'no panel' })
        expect(store.returnToPanel()).toBeNull()
    })
})
