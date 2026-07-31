import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { PositionsTable } from './PositionsTable.jsx'
import { ClosePositionDialog } from './ClosePositionDialog.jsx'
import { marketService } from '../../services/market/market.service.remote'

// The dialog gates a market close on live venue status; drive it per-symbol from the test.
vi.mock('../../services/market/market.service.remote', () => ({
    marketService: { getStatus: vi.fn() },
}))

const OPEN   = { open: true,  isCrypto: false, nextOpenMs: null }
const CLOSED = { open: false, isCrypto: false, nextOpenMs: 1_700_000_000_000 }

const pos = (id, over = {}) => ({
    id, broker: 'ctrader', accountId: 'A1', accountNo: '111', symbol: 'AAPL',
    direction: 'long', entryPrice: 100, currentPrice: 103, pnl: 30, volume: 1,
    currency: 'USD', openedAt: 1_600_000_000_000, ...over,
})
// An idea links a position by broker + account + positionId; a portfolioId groups it.
const idea = (id, over = {}) => ({
    id, savedAt: 1000, portfolioId: 'PF', portfolioName: 'Tech Book',
    brokerOrders: [{ positionId: id, broker: 'ctrader', accountId: 'A1' }], ...over,
})

afterEach(cleanup)

describe('PositionsTable — group close-all', () => {
    const positions = [pos('p1'), pos('p2', { symbol: 'MSFT' })]
    const ideas     = [idea('p1'), idea('p2')]

    it('offers Close all on the portfolio row and hands back that group’s positions', () => {
        const onCloseGroup = vi.fn()
        const { getByText } = render(
            <PositionsTable
                positions={positions}
                ideas={ideas}
                onClose={vi.fn()}
                onCloseGroup={onCloseGroup}
            />,
        )

        fireEvent.click(getByText('Close all'))

        expect(onCloseGroup).toHaveBeenCalledTimes(1)
        const arg = onCloseGroup.mock.calls[0][0]
        expect(arg.key).toBe('PF')
        expect(arg.label).toBe('Tech Book')
        expect(arg.positions.map(p => p.id)).toEqual(['p1', 'p2'])
    })

    // The summary row is also the collapse toggle — the close must not fold the book open/shut.
    it('does not toggle the group open when Close all is clicked', () => {
        const { getByText, queryByText } = render(
            <PositionsTable positions={positions} ideas={ideas} onClose={vi.fn()} onCloseGroup={vi.fn()} />,
        )
        expect(queryByText('MSFT')).toBeNull()          // starts collapsed
        fireEvent.click(getByText('Close all'))
        expect(queryByText('MSFT')).toBeNull()          // still collapsed
    })

    it('omits Close all when the caller supplies no group handler', () => {
        const { queryByText } = render(
            <PositionsTable positions={positions} ideas={ideas} onClose={vi.fn()} />,
        )
        expect(queryByText('Close all')).toBeNull()
    })

    it('keeps the per-position ✕ — the single close is unchanged', () => {
        const onClose = vi.fn()
        const { container } = render(
            <PositionsTable positions={[pos('loose')]} ideas={[]} onClose={onClose} />,
        )
        fireEvent.click(container.querySelector('.position-row__close'))
        expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ id: 'loose' }))
    })
})

describe('ClosePositionDialog — group mode', () => {
    beforeEach(() => marketService.getStatus.mockResolvedValue(OPEN))
    afterEach(() => vi.clearAllMocks())

    const group = [pos('p1'), pos('p2', { symbol: 'MSFT', pnl: -10 })]

    it('lists every position and confirms the whole group', async () => {
        const onConfirm = vi.fn()
        const { getByText, container } = render(
            <ClosePositionDialog positions={group} label="Tech Book" onConfirm={onConfirm} onCancel={vi.fn()} />,
        )

        expect(container.querySelectorAll('.close-position__list-item')).toHaveLength(2)
        expect(getByText('AAPL')).toBeTruthy()
        expect(getByText('MSFT')).toBeTruthy()

        const confirm = getByText('Close 2 positions')
        await waitFor(() => expect(confirm.disabled).toBe(false))
        fireEvent.click(confirm)
        expect(onConfirm).toHaveBeenCalledTimes(1)
    })

    it('blocks the close only when EVERY leg’s market is shut', async () => {
        marketService.getStatus.mockImplementation(symbol =>
            Promise.resolve(symbol === 'AAPL' ? CLOSED : OPEN))

        const { getByText, container } = render(
            <ClosePositionDialog positions={group} label="Tech Book" onConfirm={vi.fn()} onCancel={vi.fn()} />,
        )

        // One venue shut → warn, but the open leg must still be closable.
        await waitFor(() => expect(container.querySelector('.close-position__market-closed')).toBeTruthy())
        expect(getByText('Close 2 positions').disabled).toBe(false)
    })

    it('disables the confirm when all legs are shut', async () => {
        marketService.getStatus.mockResolvedValue(CLOSED)
        const { getByText } = render(
            <ClosePositionDialog positions={group} label="Tech Book" onConfirm={vi.fn()} onCancel={vi.fn()} />,
        )
        await waitFor(() => expect(getByText('Market closed').disabled).toBe(true))
    })

    it('surfaces a partial-failure report', () => {
        const { getByText } = render(
            <ClosePositionDialog
                positions={group}
                label="Tech Book"
                error="1 of 2 could not be closed: MSFT"
                onConfirm={vi.fn()}
                onCancel={vi.fn()}
            />,
        )
        expect(getByText('1 of 2 could not be closed: MSFT')).toBeTruthy()
    })

    it('still renders the single-position shape (no group props)', async () => {
        const { container } = render(
            <ClosePositionDialog position={pos('p1')} onConfirm={vi.fn()} onCancel={vi.fn()} />,
        )
        expect(container.querySelector('.close-position__list')).toBeNull()
        // 'Close position' is both the header and the confirm — pin the button.
        expect(container.querySelector('.close-position__btn--confirm').textContent).toBe('Close position')
        await waitFor(() => expect(marketService.getStatus).toHaveBeenCalledWith('AAPL', undefined))
    })

    it('renders nothing without a position or a group', () => {
        const { container } = render(<ClosePositionDialog onConfirm={vi.fn()} onCancel={vi.fn()} />)
        expect(container.firstChild).toBeNull()
    })
})
