import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ScannerSurface } from './ScannerSurface.jsx'

afterEach(cleanup)

// Argus's surface since 2026-11-09: the single-pick hand-off only. The list, the lens, the angle chips, the Prometheus
// read and the Generate / Update bar are archived (archive/cmps/ScannerSurface/).
describe('ScannerSurface — the hand-off only', () => {
    const session = { sessionId: 's1', agentState: { scanner: { handoff: true, handoffTo: 'mentor' } } }

    it('says the one name goes on to Mentor by itself', () => {
        render(<ScannerSurface session={session} />)
        expect(screen.getByText(/goes on to the trader by itself/)).toBeTruthy()
    })

    it('offers no list to build — no lens, no angles, no save', () => {
        render(<ScannerSurface session={session} />)
        expect(screen.queryByRole('button')).toBeNull()
        expect(screen.queryByText(/lens/i)).toBeNull()
        expect(screen.queryByText(/Generate list/)).toBeNull()
    })

    it('renders without a session (an old floor reopened)', () => {
        render(<ScannerSurface />)
        expect(screen.getByText(/one name to trade/)).toBeTruthy()
    })

    it('the pane hint names the hand-off, not a list', () => {
        expect(ScannerSurface.paneHint).toMatch(/the trader/)
        expect(ScannerSurface.paneHint).not.toMatch(/list/)
    })
})
