import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

// Prometheus's surface in the side pane (phase 8d). Only a STANDING draft is offered for saving, and only to an admin
// (house coverage is an admin write); editing a thesis adds Later. The session is a stub.

let admin = true
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: () => ({ isAdmin: admin }) }))

const { AnalystSurface, CoverageDraft } = await import('./AnalystSurface.jsx')

const DRAFT = { symbol: 'ZTS', rating: 'outperform', price_target: { base: 190 }, gap: 0.12, thesis: 'Companion-animal pricing holds.', kill_criteria: ['Vet visits fall two quarters running'] }
const EDITING = { kind: 'coverage', entityId: 'c1' }

let session
let desk
const mount = (analyst, { coverage = [], ...over } = {}) => {
    session = {
        floor: 'analyst', live: null, agentState: { analyst }, agentRev: { analyst: 1 },
        send: vi.fn(async () => true),
        commit: vi.fn(async () => ({ ok: true, result: { coverage: { id: 'c9', symbol: 'ZTS' }, revised: false } })),
        edit: vi.fn(),
        ...over,
    }
    desk = { coverage, onSaved: vi.fn() }
    return render(<AnalystSurface session={session} deskProps={desk} />)
}

afterEach(() => { cleanup(); admin = true })

describe('AnalystSurface', () => {
    it('a standing draft is drawn, and Initiate is a COMMIT; the page settles the book after', async () => {
        mount({ draft: DRAFT, standing: true })
        expect(screen.getByText('Companion-animal pricing holds.')).toBeTruthy()
        expect(screen.getByText('Vet visits fall two quarters running')).toBeTruthy()
        fireEvent.click(screen.getByText('Initiate coverage on ZTS'))
        await waitFor(() => expect(session.commit).toHaveBeenCalledWith('analyst', 'generate', expect.any(Object)))
        await screen.findByText('ZTS is in coverage.')
        expect(desk.onSaved).toHaveBeenCalledWith(expect.objectContaining({ agent: 'analyst', action: 'generate' }))
    })

    it('a name already in the book says Update; a draft that no longer stands offers no save', () => {
        mount({ draft: DRAFT, standing: true }, { coverage: [{ symbol: 'zts' }] })
        expect(screen.getByText('Update coverage on ZTS')).toBeTruthy()
        cleanup()
        mount({ draft: DRAFT, standing: false })
        expect(screen.queryByText(/coverage on ZTS/)).toBeNull()
        // 8d CR: a turn that ended without a draft to save says so — never "working" over a desk that has stopped.
        expect(screen.getByText(/last answer on ZTS put up no draft to save/)).toBeTruthy()
        cleanup()
        mount({ draft: DRAFT, standing: false }, { live: { turnId: 't1' } })
        expect(screen.getByText(/working on ZTS/)).toBeTruthy()
    })

    it('8d CR: revising one name with a draft about ANOTHER — said, and saved as its own coverage; Later is not a save', async () => {
        mount({ draft: { ...DRAFT, symbol: 'MSFT' }, standing: true, editing: EDITING, editingSymbol: 'ZTS' })
        expect(screen.getByText(/Revising ZTS — Prometheus's draft is about MSFT, another company/)).toBeTruthy()
        fireEvent.click(screen.getByText('Initiate coverage on MSFT'))
        await waitFor(() => expect(session.commit).toHaveBeenCalledWith('analyst', 'generate', expect.any(Object)))
        cleanup()
        mount({ draft: DRAFT, standing: false, editing: EDITING, editingSymbol: 'ZTS' }, { commit: vi.fn(async () => ({ ok: true, result: {} })) })
        fireEvent.click(screen.getByText(/later/i))
        await waitFor(() => expect(session.commit).toHaveBeenCalled())
        expect(desk.onSaved).not.toHaveBeenCalled()
    })

    it('8d CR: a draft with no name is never offered as "coverage on null"', () => {
        mount({ draft: { ...DRAFT, symbol: null }, standing: true })
        expect(screen.queryByText(/null/)).toBeNull()
        expect(screen.getByText('Initiate coverage on this name').closest('button').disabled).toBe(true)
    })

    it('revising a thesis: Update saves it, Later leaves it; before a new draft only Later', async () => {
        mount({ draft: DRAFT, standing: false, editing: EDITING, editingSymbol: 'ZTS' })
        expect(screen.getByText(/Revising ZTS — Prometheus drafts the new view/)).toBeTruthy()
        expect(screen.queryByText(/Update coverage/)).toBeNull()
        fireEvent.click(screen.getByText(/later/i))
        await waitFor(() => expect(session.commit).toHaveBeenCalledWith('analyst', 'later', expect.any(Object)))
        cleanup()
        mount({ draft: DRAFT, standing: true, editing: EDITING, editingSymbol: 'ZTS' })
        fireEvent.click(screen.getByText('Update coverage on ZTS'))
        await waitFor(() => expect(session.commit).toHaveBeenCalledWith('analyst', 'update', expect.any(Object)))
    })

    it('a trader reads the draft but does not save it', () => {
        admin = false
        mount({ draft: DRAFT, standing: true })
        expect(screen.getByText('Companion-animal pricing holds.')).toBeTruthy()
        expect(screen.queryByText(/Initiate coverage/)).toBeNull()
        expect(screen.getByText(/saved by an admin/)).toBeTruthy()
    })

    it('a refusal the analyst can act on explains itself', async () => {
        mount({ draft: DRAFT, standing: true }, { commit: vi.fn(async () => ({ ok: false, reason: 'rating_contradicts_target', message: 'Coverage refused', extra: { detail: 'an outperform with a target below the price' } })) })
        fireEvent.click(screen.getByText('Initiate coverage on ZTS'))
        expect((await screen.findByRole('alert')).textContent).toBe('Coverage refused — an outperform with a target below the price')
    })

    it('the draft folds, so the bar under it is never pushed off', () => {
        render(<CoverageDraft coverage={DRAFT} />)
        const head = screen.getByRole('button', { expanded: true })
        fireEvent.click(head)
        expect(screen.queryByText('Companion-animal pricing holds.')).toBeNull()
    })
})
