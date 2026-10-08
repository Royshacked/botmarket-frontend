import { describe, it, expect, afterEach } from 'vitest'
import { render, screen as rtl, cleanup, fireEvent } from '@testing-library/react'
import { IndustryView } from './IndustryView.jsx'
import { ScreenView } from './ScreenView.jsx'
import { regimeLine, keyReason, groupByBucket, changesSince } from './screenWords.js'

afterEach(cleanup)

const row = (over = {}) => ({
    code: '35203010', name: 'Life Sciences Tools & Services', sector: 'Health Care', basket_name: 'Life Sciences Tools & Services',
    bucket: 'swing_long', trade: 'yes', horizon: 'swing_and_long', quality: 8, timing: 12, timing_engine: 10,
    q11: 2, event_date: '2026-10-27', mechanism: 'IQV reports', q11_reason: 'Q3 season',
    notes: 'Margins 17.7%.', main_risk: 'Growth slowing.', changed: false, previous_bucket: null,
    scores: { q6: 2, q7: 2, q8: 2, q9: 2, q10: 2, q12: 'neutral' },
    quality_detail: { q1: 2, q2: 2, q3: 1, q4: 2, q5: 1, q1_reason: 'ROIC 18%' },
    leaders: [{ symbol: 'IQV', ret_6_1: 0.3, from_high: -0.02 }], na: {},
    ...over,
})
const SCREEN = {
    asof: '2026-10-07', previous_asof: '2026-09-30',
    regime: { regime: 'green', below_high: 0.002, above_ma200: true, ma200_rising: true, vol_elevated: false },
    rows: [
        row(),
        row({ code: '1', name: 'Steel', bucket: 'swing_only', trade: 'yes', horizon: 'swing', quality: 6, changed: true, previous_bucket: 'avoid' }),
        row({ code: '2', name: 'Electric Utilities', bucket: 'avoid', trade: 'no', horizon: null, quality: 5, timing: 3, q11: null, q11_reason: 'not assessed: Q11 could not change this bucket' }),
    ],
}

describe('screen words', () => {
    it('says the regime and what it means for size', () => {
        const r = regimeLine(SCREEN.regime)
        expect(r.word).toBe('Green')
        expect(r.text).toMatch(/0.2% below its 52-week high/)
        expect(r.text).toMatch(/full-size trading/)
        expect(regimeLine(null)).toBeNull()
    })

    it('gives each row its two scores and a dated catalyst, never a forecast', () => {
        expect(keyReason(row())).toBe('Quality 8/10 · Timing 12/12 · catalyst 2026-10-27')
        expect(keyReason(row({ scores: { q9: 0 }, red_downgrade: true, q11: 1 }))).toMatch(/downgraded: red market · extended/)
        expect(keyReason(row({ bucket: null, na: { industry: 'fewer than 3 liquid companies' } }))).toBe('fewer than 3 liquid companies')
        expect(keyReason(row())).not.toMatch(/rise|fall|buy|sell/i)
    })

    it('groups in board order and counts the changes', () => {
        expect(groupByBucket(SCREEN.rows).map(([b]) => b)).toEqual(['swing_long', 'swing_only', 'avoid'])
        expect(changesSince(SCREEN)).toEqual({ count: 1, since: '2026-09-30' })
    })
})

describe('ScreenView', () => {
    it('shows the verdict and horizon in plain words, grouped by bucket', () => {
        render(<ScreenView screen={SCREEN} />)
        expect(rtl.getByText('Good now — swing and long term')).toBeTruthy()
        expect(rtl.getByText('Not good now')).toBeTruthy()
        expect(rtl.getAllByText('Trade').length).toBe(2)
        expect(rtl.getByText('No')).toBeTruthy()
        expect(rtl.getByText('swing + long term')).toBeTruthy()
        expect(rtl.getByText(/1 changed since 2026-09-30/)).toBeTruthy()
        expect(rtl.getByText('changed')).toBeTruthy()
    })

    it('opens a row onto the catalyst, the notes, the scores and the leaders', () => {
        render(<ScreenView screen={SCREEN} />)
        fireEvent.click(rtl.getByText('Life Sciences Tools & Services'))
        expect(rtl.getByText(/2026-10-27: IQV reports/)).toBeTruthy()
        expect(rtl.getByText('Margins 17.7%.')).toBeTruthy()
        expect(rtl.getByText(/IQV \(30% 6-1/)).toBeTruthy()
        expect(rtl.getByText('quality 8/10')).toBeTruthy()
    })

    it('filters by the search, and says so when nothing is published', () => {
        render(<ScreenView screen={SCREEN} query="steel" />)
        expect(rtl.queryByText('Life Sciences Tools & Services')).toBeNull()
        expect(rtl.getByText('Steel')).toBeTruthy()
        cleanup()
        render(<ScreenView screen={null} />)
        expect(rtl.getByText(/No weekly screen yet/)).toBeTruthy()
    })
})

describe('IndustryView modes', () => {
    it('leads with Trade now when a screen exists, and switches to Structure', () => {
        render(<IndustryView industries={[]} screen={SCREEN} />)
        expect(rtl.getByText('Good now — swing and long term')).toBeTruthy()
        fireEvent.click(rtl.getByRole('tab', { name: 'Structure' }))
        expect(rtl.getByText(/No industry measurements yet/)).toBeTruthy()
        expect(rtl.getByRole('tab', { name: 'Trade now' })).toBeTruthy()
    })

    it('opens on Structure while no screen is published', () => {
        render(<IndustryView industries={[]} screen={null} />)
        expect(rtl.getByRole('tab', { name: 'Structure', selected: true })).toBeTruthy()
    })
})
