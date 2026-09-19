import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { FoldSection } from './FoldSection.jsx'

// The one folded-section shell: a summary line (title + the section's gist) over a body the
// browser opens and closes.

afterEach(cleanup)

describe('FoldSection', () => {
    it('renders the title, the tail and the body; closed unless told otherwise', () => {
        render(<FoldSection title="Thesis" tail="Base building under 238.6" tailTitle="the whole thesis">body text</FoldSection>)
        const details = document.querySelector('details.fold-section')
        expect(details.open).toBe(false)
        expect(screen.getByText('Thesis').className).toBe('fold-section__title')
        expect(screen.getByText('Base building under 238.6').getAttribute('title')).toBe('the whole thesis')
        expect(screen.getByText('body text').className).toBe('fold-section__body')
    })

    it("opens on request and carries the caller's own class beside its own", () => {
        render(<FoldSection title="Scenarios" open className="aether-candidates__sec aether-candidates__sec--warn">x</FoldSection>)
        const details = document.querySelector('details')
        expect(details.open).toBe(true)
        expect(details.className).toBe('fold-section aether-candidates__sec aether-candidates__sec--warn')
    })

    it('no tail, no tail element', () => {
        render(<FoldSection title="Journal">x</FoldSection>)
        expect(document.querySelector('.fold-section__tail')).toBeNull()
    })
})
