import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { EntityCard, SymbolCell, StatusBadge, DeleteButton } from './EntityCard.jsx'

// EntityCard is the shell every entity list renders into. The rules pinned here are the ones each
// card used to re-implement (and could re-diverge on): which clicks open the card, and which
// controls are inert when the entity is locked.

afterEach(cleanup)

describe('EntityCard click routing', () => {
    it('opens on a body click', () => {
        const onOpen = vi.fn()
        const { container } = render(
            <EntityCard status="waiting" title={<span>NQ</span>} summary={<span>summary</span>} onOpen={onOpen} />,
        )
        fireEvent.click(container.querySelector('.idea-card__body'))
        expect(onOpen).toHaveBeenCalledTimes(1)
    })

    it('does NOT open when a control is clicked — the buttons handle themselves', () => {
        const onOpen = vi.fn()
        const onDelete = vi.fn()
        const { container } = render(
            <EntityCard
                status="waiting"
                title={<span>NQ</span>}
                controls={<DeleteButton onClick={onDelete} />}
                onOpen={onOpen}
            />,
        )
        fireEvent.click(container.querySelector('.icon-btn'))
        expect(onDelete).toHaveBeenCalledTimes(1)
        expect(onOpen).not.toHaveBeenCalled()
    })

    it('does NOT open when the ticker is clicked — that goes to the chart', () => {
        const onOpen = vi.fn()
        const onSymbolClick = vi.fn()
        const { container } = render(
            <EntityCard
                status="waiting"
                title={<SymbolCell symbol="NQ" onSymbolClick={onSymbolClick} />}
                onOpen={onOpen}
            />,
        )
        fireEvent.click(container.querySelector('.idea-card__sym'))
        expect(onSymbolClick).toHaveBeenCalledWith('NQ')
        expect(onOpen).not.toHaveBeenCalled()
    })

    it('is inert with no onOpen — a draft still building is not clickable', () => {
        const { container } = render(<EntityCard status="building" title={<span>NQ</span>} />)
        // No throw, and the cursor says so.
        fireEvent.click(container.querySelector('.idea-card__body'))
        expect(container.querySelector('.idea-card').style.cursor).toBe('default')
    })

    it('carries the lifecycle status as a modifier class', () => {
        const { container } = render(<EntityCard status="long" title={<span>NQ</span>} />)
        expect(container.querySelector('.idea-card--long')).toBeTruthy()
    })
})

describe('shared controls', () => {
    it('DeleteButton with a lockedReason is disabled and explains itself', () => {
        const onDelete = vi.fn()
        const { container } = render(
            <DeleteButton onClick={onDelete} lockedReason="In a live position — close it at the broker first" />,
        )
        const btn = container.querySelector('.icon-btn')
        expect(btn.disabled).toBe(true)
        expect(btn.title).toMatch(/live position/i)
        fireEvent.click(btn)
        expect(onDelete).not.toHaveBeenCalled()
    })

    it('StatusBadge is a plain badge without onToggle, a button with it', () => {
        const { container: readOnly } = render(<StatusBadge status="hit" label="Triggered" />)
        expect(readOnly.querySelector('button')).toBeNull()
        expect(readOnly.querySelector('.idea-card__status-badge')).toBeTruthy()

        const onToggle = vi.fn()
        const { container: toggle } = render(<StatusBadge status="waiting" label="Arm it" onToggle={onToggle} />)
        fireEvent.click(toggle.querySelector('.idea-card__status-toggle'))
        expect(onToggle).toHaveBeenCalledTimes(1)
    })

    it('StatusBadge can borrow another kind\'s icon without renaming its own status', () => {
        // The call pop-out uses this: a position filled SHORT shows the short icon, taken from
        // position_state.entry.direction rather than from the status word.
        const { container } = render(<StatusBadge status="long" iconStatus="short" label="in position" />)
        expect(container.querySelector('.status--short')).toBeTruthy()
    })
})

describe('SymbolCell — the ticker is the chart, everywhere', () => {
    // The same span is now used by the cards AND by every Floor row. It cannot be two
    // copies: a Floor row IS a <button> and a button cannot contain a button, so the
    // clickable ticker has to be this exact span-with-stopPropagation in both places.

    it('calls back with the symbol', () => {
        const onSymbolClick = vi.fn()
        render(<SymbolCell symbol="NVDA" onSymbolClick={onSymbolClick} />)
        fireEvent.click(screen.getByText('NVDA'))
        expect(onSymbolClick).toHaveBeenCalledWith('NVDA')
    })

    it('does not let the click reach the row or card it sits in', () => {
        // THE PROPERTY THE WHOLE THING RESTS ON. Every container this lives in is itself
        // clickable — a card opens, a Floor row expands — so without stopPropagation the
        // chart would ride along with whatever the container does.
        const onSymbolClick = vi.fn()
        const onContainer = vi.fn()
        render(
            <button onClick={onContainer}>
                <SymbolCell symbol="NVDA" onSymbolClick={onSymbolClick} />
            </button>,
        )
        fireEvent.click(screen.getByText('NVDA'))
        expect(onSymbolClick).toHaveBeenCalledWith('NVDA')
        expect(onContainer).not.toHaveBeenCalled()
    })

    it('wears the Floor grid class when a list asks for one', () => {
        render(<SymbolCell symbol="NVDA" onSymbolClick={() => {}} className="floor-row__sym" />)
        expect(screen.getByText('NVDA').className).toContain('floor-row__sym')
    })

    it('looks clickable whenever there is a ticker to chart', () => {
        // Discoverability is the point: a ticker that opens a chart has to read differently
        // from the text beside it, or the behaviour can only be found by accident.
        //
        // It used to key off whether a HANDLER had been threaded in, which made the
        // affordance a property of the wiring rather than of the ticker. A list nobody had
        // threaded rendered a plain-looking ticker that also did nothing, so the two
        // failures hid each other.
        const { rerender } = render(<SymbolCell symbol="NVDA" onSymbolClick={() => {}} />)
        expect(screen.getByText('NVDA').className).toContain('sym--chartable')

        rerender(<SymbolCell symbol="NVDA" />)
        expect(screen.getByText('NVDA').className).toContain('sym--chartable')

        rerender(<SymbolCell symbol="" />)
        expect(screen.getByText('—').className).not.toContain('sym--chartable')
    })

    it('a row with no symbol is inert rather than a dash you can press', () => {
        const onSymbolClick = vi.fn()
        render(<SymbolCell symbol="" onSymbolClick={onSymbolClick} />)
        fireEvent.click(screen.getByText('—'))
        expect(onSymbolClick).not.toHaveBeenCalled()
    })
})

describe('SymbolCell docks the chart itself', () => {
    // THE BUG THIS PINS. The click was threaded up to MainPage as `onSymbolClick`, and there
    // it landed on `const [, setChartSymbol] = useState(...)` — a setter whose state nobody
    // reads. Every click was a no-op, which on screen is indistinguishable from a click that
    // missed the target. Three call sites, all dead, and the tests passed throughout because
    // they asserted the callback fired rather than that a chart appeared.

    it('opens the chart through the shared store when no handler is given', async () => {
        const { currentChart } = await import('../../services/chartSurface.service.js')
        render(<SymbolCell symbol="NVDA" />)
        fireEvent.click(screen.getByText('NVDA'))
        expect(currentChart()?.ticker).toBe('NVDA')
    })

    it('is clickable with no handler at all', () => {
        // It used to need one to look clickable, so every list that had not been threaded
        // rendered a ticker that looked inert and was.
        render(<SymbolCell symbol="NVDA" />)
        expect(screen.getByText('NVDA').className).toContain('sym--chartable')
    })

    it('an explicit handler still wins, for callers that mean something else', async () => {
        const { openChart } = await import('../../services/chartSurface.service.js')
        openChart({ ticker: 'SPY' })
        const onSymbolClick = vi.fn()
        render(<SymbolCell symbol="NVDA" onSymbolClick={onSymbolClick} />)
        fireEvent.click(screen.getByText('NVDA'))
        expect(onSymbolClick).toHaveBeenCalledWith('NVDA')
        const { currentChart } = await import('../../services/chartSurface.service.js')
        expect(currentChart()?.ticker).toBe('SPY')   // untouched by the override
    })

    it('a row with no symbol docks nothing', async () => {
        const { openChart, currentChart } = await import('../../services/chartSurface.service.js')
        openChart({ ticker: 'SPY' })
        render(<SymbolCell symbol="" />)
        fireEvent.click(screen.getByText('—'))
        expect(currentChart()?.ticker).toBe('SPY')
    })
})
