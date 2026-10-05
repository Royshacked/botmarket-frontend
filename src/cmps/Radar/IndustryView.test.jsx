import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { IndustryView } from './IndustryView.jsx'
import { gradeFor } from './industryGrade.js'

afterEach(cleanup)

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

describe('IndustryView', () => {
    it('groups by sector and says how many Pythia has answered', () => {
        render(<IndustryView industries={[measured({ view: answered }), measured({ code: '10102010', name: 'Integrated Oil & Gas', sector: 'Energy' })]} />)
        expect(screen.getByText('Information Technology')).toBeTruthy()
        expect(screen.getByText('Energy')).toBeTruthy()
        expect(screen.getByText(/of 2 answered by Pythia/)).toBeTruthy()
    })

    it('a measured grade is marked as not yet reviewed; an answered one opens to its reasoning', () => {
        const { container } = render(<IndustryView industries={[measured(), measured({ code: 'X', name: 'Answered One', view: answered })]} />)
        expect(container.querySelectorAll('.industry-grade--measured').length).toBe(3)
        fireEvent.click(screen.getByText('Answered One'))
        expect(screen.getByText(/the house departs: Margin floor moved/)).toBeTruthy()
        expect(screen.getByText(/next review 2027-01-05/)).toBeTruthy()
    })

    it('says when a sub-industry is measured at its parent, and flags a trigger', () => {
        const { container } = render(<IndustryView industries={[measured({ name: 'Motorcycle Manufacturers', answered_at: { level: 'industry', name: 'Automobiles' }, triggers: ['margin_at_range_edge'] })]} />)
        expect(screen.getByText('via Automobiles')).toBeTruthy()
        expect(container.querySelector('.industry-view__trigger').title).toMatch(/edge of their 10-year range/)
    })

    it('finds an industry by name, and says so when nothing matches', () => {
        render(<IndustryView industries={[measured(), measured({ code: 'B', name: 'Regional Banks', sector: 'Financials' })]} />)
        fireEvent.change(screen.getByLabelText('Find an industry'), { target: { value: 'bank' } })
        expect(screen.queryByText('Semiconductors')).toBeNull()
        expect(screen.getByText('Regional Banks')).toBeTruthy()
        fireEvent.change(screen.getByLabelText('Find an industry'), { target: { value: 'zzz' } })
        expect(screen.getByText(/No industry matches/)).toBeTruthy()
    })

    it('with no measurements yet, says the engine has not run', () => {
        render(<IndustryView industries={[]} />)
        expect(screen.getByText(/the engine has not run/)).toBeTruthy()
    })
})
