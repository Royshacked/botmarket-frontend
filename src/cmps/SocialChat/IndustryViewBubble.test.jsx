import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { IndustryViewBubble } from './ChatWindow.jsx'
import { eventBus, OPEN_SECTOR_VIEW } from '../../services/event-bus.service'

// The bubble's module (ChatWindow.jsx) pulls in axios-backed service modules at load time.
vi.mock('../../services/manual/manual.service.remote', () => ({ manualService: {} }))

afterEach(cleanup)

const msg = {
    id: 'm1', type: 'industry_view',
    content: 'Semiconductors: cycle mid → peak. Top of the cycle.',
    actions: { primary: { label: 'Open industry' }, dismiss: true },
    payload: { kind: 'industry_view', code: '45301020', industryViewId: 'iv_45301020', changed: { cycle: { from: 'mid', to: 'peak' } } },
}

describe('IndustryViewBubble', () => {
    it('names what changed and opens the Forecasts board', () => {
        const heard = vi.fn(), onClose = vi.fn()
        const off = eventBus.on(OPEN_SECTOR_VIEW, heard)
        render(<IndustryViewBubble msg={msg} onClose={onClose} onResolve={vi.fn()} />)
        expect(screen.getByText(/Industry view · cycle changed/)).toBeTruthy()
        fireEvent.click(screen.getByText('Open industry'))
        expect(heard).toHaveBeenCalled()
        expect(onClose).toHaveBeenCalled()
        off()
    })
})
