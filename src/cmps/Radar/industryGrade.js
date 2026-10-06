// The grade the Forecasts board shows for one question (IndustryView). Its own module so the
// component file exports only components (fast refresh).

// The three grades in words a user can act on (Roy, 2026-10-06: "as a user I don't know what to do with
// it"). A DESCRIPTION of the industry — is it expanding, does it earn its keep, are today's profits
// normal — never a buy or sell: what the industry is, not where its price goes.
const DEMAND_WORDS  = { growing: 'Expanding', in_line: 'Growing with the economy', shrinking: 'Shrinking' }
const RETURN_WORDS  = { good: 'earns above its cost of capital', average: 'earns about its cost of capital', poor: 'earns below its cost of capital' }
const CYCLE_WORDS   = { peak: 'profits above normal', mid: 'profits near normal', trough: 'profits below normal', stable: 'steady profits' }
// What the cycle grade means for anyone reading today's earnings. Shown in the detail.
const CYCLE_READING = {
    peak:   'Profits sit at the top of their 10-year range, so today’s earnings flatter the industry — its normal margin is the fairer base.',
    mid:    'Profits are near their normal level, so today’s earnings are a fair base.',
    trough: 'Profits sit at the bottom of their 10-year range, so today’s earnings understate the industry — its normal margin is the fairer base.',
    stable: 'Profits barely move through cycles, so today’s earnings are a fair base.',
}

/**
 * `{ line, reading }` for a row: `line` is the three grades in words ("Expanding · earns above its cost
 * of capital · profits above normal"), `reading` what the cycle means for today's earnings. Built from
 * the grades the chips show (gradeFor), so the words never disagree with them. Null with no grade. Pure.
 */
export function conclusionFor(row) {
    const d = gradeFor(row, 'demand').grade, e = gradeFor(row, 'economics').grade, c = gradeFor(row, 'cycle').grade
    const parts = [DEMAND_WORDS[d], RETURN_WORDS[e], CYCLE_WORDS[c]].filter(Boolean)
    if (!parts.length) return null
    return { line: parts.join(' · '), reading: CYCLE_READING[c] ?? null }
}

/** The grade to show for one question: the house answer, else the measured read. Pure. */
export function gradeFor(row, q) {
    const answered = row.view?.status === 'answered'
    const house = answered ? row.view?.[q]?.grade ?? null : null
    return house
        ? { grade: house, source: 'house', departs: Boolean(row.view?.[q]?.override_reason) }
        : { grade: row.grades?.[q] ?? null, source: 'measured', departs: false }
}
