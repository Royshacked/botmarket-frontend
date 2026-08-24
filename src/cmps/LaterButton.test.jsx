import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { LaterButton, LATER_BTN_CLASS } from './LaterButton.jsx'

afterEach(cleanup)

// Eight panels rendered this sentence by hand. The point of the shared one is that the WORDS and
// the button contract come from here — a panel supplies only what "later" does and which shell it
// sits in. These pin the parts a panel is no longer allowed to re-decide.
describe('LaterButton', () => {
    const get = () => screen.getByRole('button', { name: "I'll do it later" })

    it('is the escape it says it is', () => {
        const onClick = vi.fn()
        render(<LaterButton onClick={onClick} />)
        fireEvent.click(get())
        expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('defaults to the shared action-bar shell — six of the eight sites want exactly this', () => {
        render(<LaterButton onClick={vi.fn()} />)
        expect(get().className).toBe(LATER_BTN_CLASS)
    })

    it('takes a panel shell when one is passed — the idea chat and Atlas size it to their primary', () => {
        render(<LaterButton className="portfolio-panel__generate portfolio-panel__generate--cancel" onClick={vi.fn()} />)
        expect(get().className).toBe('portfolio-panel__generate portfolio-panel__generate--cancel')
    })

    it('never submits a form it happens to sit in', () => {
        render(<LaterButton onClick={vi.fn()} />)
        expect(get().getAttribute('type')).toBe('button')
    })

    // Atlas disables it while a review is being applied — the ONE case where the escape is not live.
    it('disables on request', () => {
        const onClick = vi.fn()
        render(<LaterButton onClick={onClick} disabled />)
        expect(get().disabled).toBe(true)
        fireEvent.click(get())
        expect(onClick).not.toHaveBeenCalled()
    })
})
