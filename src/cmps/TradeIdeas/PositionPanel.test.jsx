import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { PositionPanel } from './PositionPanel.jsx'

// The monitor's view of a live trade, shared by the call and setup pop-outs. Most of it is a
// straight read of `position_state`; what earns tests is the TARGET LADDER, which renders two
// genuinely different things off one array — a call's plain level, and a setup's TP window where
// the limit rests at the target and Talos wakes beneath it.

afterEach(cleanup)

const PS = (over = {}) => ({
    entry:   { fill_price: 238.6, size: 100, direction: 'long' },
    stop:    { initial: 234.8, current: 234.8 },
    metrics: { r_multiple_now: 0.8, mae: -0.3, mfe: 1.4 },
    targets: [],
    ...over,
})

const targets = () => within(screen.getByText('Targets').closest('div'))

describe('the target ladder', () => {
    it('shows BOTH edges of a window — where Talos asks, and where the limit rests', () => {
        // Showing only one is how a user ends up believing the trade exits at the price that merely
        // starts a conversation.
        render(<PositionPanel ps={PS({ targets: [{ price: 246, resting: 247.2, hit_at: null }] })} status="long" />)
        const rung = targets().getByTitle(/Talos offers a partial from 246.*rests at 247\.2/)
        expect(rung.textContent).toContain('246')
        expect(rung.textContent).toContain('247.2')
    })

    it('renders an exact level as one number, because there is only one', () => {
        // A zero-width band: it rests and is taken without asking, so there is no window to draw.
        render(<PositionPanel ps={PS({ targets: [{ price: null, resting: 246, hit_at: null }] })} status="long" />)
        expect(targets().getByTitle(/taken without asking/).textContent).toBe('246')
    })

    it('renders a call\'s plain target unchanged — no window, no arrow', () => {
        render(<PositionPanel ps={PS({ targets: [{ price: 246, hit_at: null }] })} status="long" />)
        expect(targets().getByText('246')).toBeTruthy()
    })

    it('distinguishes ASKED from HIT, because one of them is not money', () => {
        // On a window `hit_at` means Talos opened the conversation and the limit is still out there
        // unfilled. Wearing the "banked" colour would tell the user they had taken something.
        render(<PositionPanel ps={PS({ targets: [
            { price: 246, resting: 247.2, hit_at: '2026-08-15T10:00:00.000Z' },
            { price: 252, hit_at: '2026-08-15T11:00:00.000Z' },
        ] })} status="long" />)

        const rows = targets().getAllByTitle(/.*/).filter(el => el.className.includes('position-panel__target'))
        const asked = rows.find(el => el.textContent.includes('247.2'))
        expect(asked.className).toContain('is-asked')
        expect(asked.className).not.toContain('is-hit')
        expect(targets().getByText(/252/).className).toContain('is-hit')
    })

    it('reads the meaning off the SHAPE, not off a kind flag', () => {
        // The same component serves both desks; nothing tells it which one is calling.
        render(<PositionPanel ps={PS({ targets: [{ price: 246, resting: 247.2, hit_at: null }] })} status="short" />)
        expect(targets().getByTitle(/rests at 247\.2/)).toBeTruthy()
    })
})

describe('the panel', () => {
    it('shows the working stop and says where it started when it has moved', () => {
        render(<PositionPanel ps={PS({ stop: { initial: 234.8, current: 240 } })} status="long" />)
        expect(screen.getByText('240')).toBeTruthy()
        expect(screen.getByText(/init 234\.8/)).toBeTruthy()
    })

    it('drops the live-only cells once the trade is closed', () => {
        // R now / phase / MFE-MAE describe a trade in flight; the outcome replaces them.
        render(<PositionPanel status="closed" ps={PS({
            phase: 'running',
            outcome: { reason: 'target', r_multiple: 2.1, exit_price: 247.2, pnl: 860 },
        })} />)
        expect(screen.queryByText('R now')).toBeNull()
        expect(screen.queryByText('Phase')).toBeNull()
        expect(screen.getByText('+2.1R')).toBeTruthy()
        expect(screen.getByText(/exit 247\.2/)).toBeTruthy()
    })

    it('survives a position_state with nothing in it', () => {
        // A fill stamped off-hours reaches the panel before any metrics wake has run.
        const { container } = render(<PositionPanel ps={{}} status="long" />)
        expect(container.querySelector('.position-panel')).toBeTruthy()
        expect(screen.queryByText('Targets')).toBeNull()
    })
})
