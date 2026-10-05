// The grade the Forecasts board shows for one question (IndustryView). Its own module so the
// component file exports only components (fast refresh).

/** The grade to show for one question: the house answer, else the measured read. Pure. */
export function gradeFor(row, q) {
    const answered = row.view?.status === 'answered'
    const house = answered ? row.view?.[q]?.grade ?? null : null
    return house
        ? { grade: house, source: 'house', departs: Boolean(row.view?.[q]?.override_reason) }
        : { grade: row.grades?.[q] ?? null, source: 'measured', departs: false }
}
