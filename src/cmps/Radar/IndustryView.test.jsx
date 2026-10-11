import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { IndustryView } from './IndustryView.jsx'
import { gradeFor, conclusionFor } from './industryGrade.js'

afterEach(cleanup)

// The board opens on Assessed (step 6, 2026-10-11); these read the Structure tab.
function structure(ui) {
    const r = render(ui)
    fireEvent.click(screen.getByRole('tab', { name: 'Structure' }))
    return r
}

const measured = (over = {}) => ({
    code: '45301020', name: 'Semiconductors', sector: 'Information Technology', industry: 'Semiconductors & Semiconductor Equipment',
    answered_at: { level: 'sub_industry', code: '45301020', name: 'Semiconductors' }, n_companies: 41,
    grades: { demand: 'growing', economics: 'good', cycle: 'peak' }, cyclical: true, triggers: [], view: null,
    ...over,
})
const answered = {
    status: 'answered', summary: 'Great industry, top of the cycle.',
    demand: { grade: 'growing', rationale: 'Revenue 12%/yr.' },
    economics: { grade: 'good', rationale: 'ROIC 18% vs 10.6%.' },
    cycle: { grade: 'mid', rationale: 'r', code_grade: 'peak', override_reason: 'Margin floor moved.' },
    reopen_if: ['revenue falls two quarters'], next_review: '2027-01-05T00:00:00.000Z', updated_at: '2026-10-05T00:00:00.000Z',
}

describe('gradeFor', () => {
    it('shows the house answer where there is one, and the measured read where there is not', () => {
        expect(gradeFor(measured({ view: answered }), 'cycle')).toEqual({ grade: 'mid', source: 'house', departs: true })
        expect(gradeFor(measured(), 'cycle')).toEqual({ grade: 'peak', source: 'measured', departs: false })
        expect(gradeFor(measured({ view: { status: 'pending' } }), 'demand').source).toBe('measured')
    })
})

describe('conclusionFor', () => {
    it('puts the three grades in words — what the industry is, never a buy or sell', () => {
        const c = conclusionFor(measured())
        expect(c.line).toBe('Expanding · earns above its cost of capital · profits above normal')
        expect(c.reading).toMatch(/today’s earnings flatter the industry/)
        expect(c.line + c.reading).not.toMatch(/buy|sell|rise|fall/i)
    })

    it('follows the house answer where there is one, so the words never disagree with the chips', () => {
        expect(conclusionFor(measured({ view: answered })).line).toBe('Expanding · earns above its cost of capital · profits near normal')
    })

    it('reads every grade, and leaves out a question with no grade', () => {
        expect(conclusionFor(measured({ grades: { demand: 'shrinking', economics: 'poor', cycle: 'trough' } })).line)
            .toBe('Shrinking · earns below its cost of capital · profits below normal')
        expect(conclusionFor(measured({ grades: { demand: 'in_line', economics: 'average', cycle: null } })))
            .toEqual({ line: 'Growing with the economy · earns about its cost of capital', reading: null })
        expect(conclusionFor(measured({ grades: { demand: null, economics: null, cycle: null } }))).toBeNull()
    })
})

describe('IndustryView', () => {
    it('shows each row\'s conclusion under its name, and what the cycle means when opened', () => {
        structure(<IndustryView industries={[measured()]} />)
        expect(screen.getByText('Expanding · earns above its cost of capital · profits above normal')).toBeTruthy()
        fireEvent.click(screen.getByText('Semiconductors'))
        expect(screen.getByText(/today’s earnings flatter the industry/)).toBeTruthy()
    })

    it('groups by sector and says how many Pythia has answered', () => {
        structure(<IndustryView industries={[measured({ view: answered }), measured({ code: '10102010', name: 'Integrated Oil & Gas', sector: 'Energy' })]} />)
        expect(screen.getByText('Information Technology')).toBeTruthy()
        expect(screen.getByText('Energy')).toBeTruthy()
        expect(screen.getByText(/of 2 answered by Pythia/)).toBeTruthy()
    })

    it('a measured grade is marked as not yet reviewed; an answered one opens to its reasoning', () => {
        const { container } = structure(<IndustryView industries={[measured(), measured({ code: 'X', name: 'Answered One', view: answered })]} />)
        expect(container.querySelectorAll('.industry-grade--measured').length).toBe(3)
        fireEvent.click(screen.getByText('Answered One'))
        expect(screen.getByText(/the house departs: Margin floor moved/)).toBeTruthy()
        expect(screen.getByText(/next review 2027-01-05/)).toBeTruthy()
    })

    it('says when a sub-industry is measured at its parent, and flags a trigger', () => {
        const { container } = structure(<IndustryView industries={[measured({ name: 'Motorcycle Manufacturers', answered_at: { level: 'industry', name: 'Automobiles' }, triggers: ['margin_at_range_edge'] })]} />)
        expect(screen.getByText('via Automobiles')).toBeTruthy()
        expect(container.querySelector('.industry-view__trigger').title).toMatch(/edge of their 10-year range/)
    })

    it('finds an industry by name, and says so when nothing matches', () => {
        structure(<IndustryView industries={[measured(), measured({ code: 'B', name: 'Regional Banks', sector: 'Financials' })]} />)
        fireEvent.change(screen.getByLabelText('Find an industry'), { target: { value: 'bank' } })
        expect(screen.queryByText('Semiconductors')).toBeNull()
        expect(screen.getByText('Regional Banks')).toBeTruthy()
        fireEvent.change(screen.getByLabelText('Find an industry'), { target: { value: 'zzz' } })
        expect(screen.getByText(/No industry matches/)).toBeTruthy()
    })

    it('with no measurements yet, says the engine has not run', () => {
        structure(<IndustryView industries={[]} />)
        expect(screen.getByText(/the engine has not run/)).toBeTruthy()
    })
})

describe('IndustryView — a failed read', () => {
    it('says the read failed rather than that the engine has not run', () => {
        structure(<IndustryView industries={[]} error />)
        expect(screen.getByText(/Could not load the industry views/)).toBeTruthy()
        expect(screen.queryByText(/the engine has not run/)).toBeNull()
    })
})
