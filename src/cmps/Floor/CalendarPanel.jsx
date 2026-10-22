import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { DetailPanel } from '../DetailPanel/DetailPanel.jsx'
import { closeForHandOff } from '../Stage/stage.store.js'
import { useDetailPanel } from '../DetailPanel/detailPanel.store.js'
import { calendarService } from '../../services/calendar/calendar.service.remote.js'
import { CalendarRows } from './CalendarRows.jsx'
import {
    WEEK_HEAD, addDays, todayIso, monthOf, shiftMonth, monthGrid, fmtMonth, fmtLongDay, isWeekend,
} from './calendar.utils.js'

// THE CALENDAR — one Floor desk that opens a month in the detail panel (Roy, 2026-10-14).
//
// It replaced three desks (Earnings, Fed, IPO), each a week-long list in the narrow lists column.
// A month is a grid, and a grid needs width, so it opens where the other pages of reading do: the
// DetailPanel over the chat column. Each day shows how many earnings, Fed releases and IPOs fall
// on it; clicking a day REPLACES the grid with that date's page, and the page's back arrow returns.
//
// The two views cost differently, and the backend is built around it: the grid asks for bare
// counts (cheap — no company lookups), and only an opened day pays for names, logos and rows.
//
// Earnings and IPO rows stay doorways, exactly as they were in the old desks: clicking one hands
// it to Mentor to build a setup around. Mentor lives in the chat column UNDER this panel, so the
// panel closes first — otherwise the seed lands in a chat nobody can see.

export const CALENDAR_PANEL_ID = 'calendar'

const KINDS = [
    { key: 'earnings', one: 'earning',      many: 'earnings' },
    { key: 'fed',      one: 'Fed release',  many: 'Fed releases' },
    { key: 'ipo',      one: 'IPO',          many: 'IPOs' },
]
const plural = (n, k) => `${n} ${n === 1 ? k.one : k.many}`

export function CalendarPanel({ onEarningSelect, onIpoSelect, onSymbolClick }) {
    const { isOpen, close } = useDetailPanel(CALENDAR_PANEL_ID)
    const [month, setMonth] = useState(() => monthOf())
    const [date, setDate]   = useState(null)       // null = the month grid; a date = its page
    const [counts, setCounts] = useState({ key: null, status: 'idle', days: {} })
    const [day, setDay]       = useState({ date: null, status: 'idle', data: null })
    const [retry, setRetry]   = useState(0)
    // Months already read while the panel is open — paging back and forth must not refetch.
    // Dropped on close, so reopening tomorrow is never served yesterday's counts.
    const seen = useRef(new Map())

    // Every open starts on THIS month's grid — decided AT the open, in render, not in an effect on
    // close (CR 2026-10-14): the panel stays mounted all session, so a month fixed when it closed on
    // Oct 31 reopened on October on Nov 1, and an effect would fetch that old month before fixing it.
    const [wasOpen, setWasOpen] = useState(isOpen)
    if (isOpen !== wasOpen) {
        setWasOpen(isOpen)
        if (isOpen) { setDate(null); setMonth(monthOf()) }
    }
    useEffect(() => { if (!isOpen) seen.current.clear() }, [isOpen])

    // Keyboard focus follows the view: a day's page takes it when it opens (the clicked cell is gone
    // with the grid), and going back hands it to the cell you came from.
    const bodyRef = useRef(null)
    const cameFrom = useRef(null)
    useEffect(() => {
        if (!isOpen) return
        if (date) { cameFrom.current = date; bodyRef.current?.querySelector('.cal-day')?.focus({ preventScroll: true }); return }
        if (cameFrom.current) {
            bodyRef.current?.querySelector(`.cal-cell[data-date="${cameFrom.current}"]`)?.focus({ preventScroll: true })
            cameFrom.current = null
        }
    }, [isOpen, date])

    const grid = monthGrid(month)
    const monthKey = `${grid.from}|${grid.to}`

    useEffect(() => {
        if (!isOpen) return
        const cached = seen.current.get(monthKey)
        if (cached) { setCounts({ key: monthKey, status: 'ok', days: cached }); return }
        let live = true
        setCounts({ key: monthKey, status: 'loading', days: {} })
        calendarService.getCounts(grid.from, grid.to).then(
            d => { if (!live) return; seen.current.set(monthKey, d.days); setCounts({ key: monthKey, status: 'ok', days: d.days }) },
            () => { if (live) setCounts({ key: monthKey, status: 'error', days: {} }) },
        )
        return () => { live = false }
    // grid.from/to are monthKey's parts
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, monthKey, retry])

    useEffect(() => {
        if (!isOpen || !date) return
        let live = true
        setDay({ date, status: 'loading', data: null })
        calendarService.getDay(date).then(
            data => { if (live) setDay({ date, status: 'ok', data }) },
            () => { if (live) setDay({ date, status: 'error', data: null }) },
        )
        return () => { live = false }
    }, [isOpen, date, retry])

    // A date page can step to its neighbours; leaving the month follows it, so "back" lands on the
    // month you are in.
    const goDay = (iso) => { setDate(iso); setMonth(monthOf(iso)) }
    // On the Floor's stage the calendar stays under the desk it hands to (closeForHandOff).
    const handOff = (fn) => fn && ((item) => { closeForHandOff(close); fn(item) })

    const today = todayIso()
    const title = date ? fmtLongDay(date) : fmtMonth(month)
    const actions = date ? (
        <div className="cal-nav">
            <button type="button" className="cal-nav__btn" onClick={() => setDate(null)}>‹ {fmtMonth(month).split(' ')[0]}</button>
            <button type="button" className="cal-nav__btn" onClick={() => goDay(addDays(date, -1))} aria-label="Previous day">‹</button>
            <button type="button" className="cal-nav__btn" onClick={() => goDay(addDays(date, 1))} aria-label="Next day">›</button>
        </div>
    ) : (
        <div className="cal-nav">
            <button type="button" className="cal-nav__btn" onClick={() => setMonth(m => shiftMonth(m, -1))} aria-label="Previous month">‹</button>
            {/* The month's NAME between its arrows (Roy, 2026-10-14) — and still the way home:
                clicking it returns to this month. */}
            <button type="button" className="cal-nav__btn cal-nav__btn--month" onClick={() => setMonth(monthOf())} title="Back to this month">
                {fmtMonth(month).split(' ')[0]}
            </button>
            <button type="button" className="cal-nav__btn" onClick={() => setMonth(m => shiftMonth(m, 1))} aria-label="Next month">›</button>
        </div>
    )

    return (
        <DetailPanel id={CALENDAR_PANEL_ID} kicker="Calendar" title={title} actions={actions} className="cal-panel" container compact>
            <div ref={bodyRef}>
                {date
                    ? <div className="cal-day" tabIndex={-1} aria-label={fmtLongDay(date)}>
                        <DayPage day={day} onRetry={() => setRetry(n => n + 1)} onSymbolClick={onSymbolClick}
                            onEarningSelect={handOff(onEarningSelect)} onIpoSelect={handOff(onIpoSelect)} />
                      </div>
                    // goDay, not setDate: a padding-row day (Nov 1 under October) moves the month with
                    // it, exactly as stepping into it with › does — one rule for where "back" lands.
                    : <MonthGrid grid={grid} month={month} today={today} counts={counts} onPick={goDay}
                        onRetry={() => setRetry(n => n + 1)} />}
            </div>
        </DetailPanel>
    )
}
CalendarPanel.propTypes = {
    onEarningSelect: PropTypes.func,
    onIpoSelect:     PropTypes.func,
    onSymbolClick:   PropTypes.func,
}

function MonthGrid({ grid, month, today, counts, onPick, onRetry }) {
    const inMonth = iso => Number(iso.slice(5, 7)) === month.m
    return (
        <div className="cal-grid">
            {counts.status === 'error' && (
                <p className="cal-grid__note">Couldn’t load this month’s counts. <button type="button" className="cal-link" onClick={onRetry}>Try again</button></p>
            )}
            <div className="cal-grid__row cal-grid__row--head" aria-hidden="true">
                {WEEK_HEAD.map(w => <span key={w} className="cal-grid__wd">{w}</span>)}
            </div>
            {grid.weeks.map(week => (
                <div key={week[0]} className="cal-grid__row">
                    {week.map(iso => {
                        const c = counts.days[iso]
                        const lines = KINDS.filter(k => c?.[k.key] > 0)
                        // The market-moving Fed releases (CPI, Jobs, PCE, GDP, FOMC) are named and the
                        // day is marked, so a CPI morning stands out from a Jobless Claims one.
                        const key = c?.fedHigh ?? []
                        const label = `${fmtLongDay(iso)}: ${lines.length ? lines.map(k => plural(c[k.key], k)).join(', ') : 'nothing scheduled'}`
                            + (key.length ? ` — important: ${key.join(', ')}` : '')
                        return (
                            <button
                                key={iso}
                                data-date={iso}
                                type="button"
                                className={[
                                    'cal-cell',
                                    !inMonth(iso) && 'cal-cell--out',
                                    isWeekend(iso) && 'cal-cell--weekend',
                                    iso === today && 'cal-cell--today',
                                    !lines.length && 'cal-cell--quiet',
                                    key.length && 'cal-cell--key',
                                ].filter(Boolean).join(' ')}
                                onClick={() => onPick(iso)}
                                aria-label={label}
                                title={key.length ? `Important: ${key.join(', ')}` : undefined}
                            >
                                <span className="cal-cell__num">{Number(iso.slice(8))}</span>
                                {key.length > 0 && <span className="cal-cell__key" aria-hidden="true">★ {key.join(' · ')}</span>}
                                {lines.map(k => (
                                    <span key={k.key} className={`cal-cell__line cal-cell__line--${k.key}`}>
                                        <b>{c[k.key]}</b> {k.key === 'earnings' ? 'Earnings' : k.key === 'fed' ? 'Fed' : (c[k.key] === 1 ? 'IPO' : 'IPOs')}
                                    </span>
                                ))}
                            </button>
                        )
                    })}
                </div>
            ))}
            {counts.status === 'loading' && <p className="cal-grid__note" aria-live="polite">Loading counts…</p>}
        </div>
    )
}
MonthGrid.propTypes = {
    grid:    PropTypes.object.isRequired,
    month:   PropTypes.object.isRequired,
    today:   PropTypes.string.isRequired,
    counts:  PropTypes.object.isRequired,
    onPick:  PropTypes.func.isRequired,
    onRetry: PropTypes.func.isRequired,
}

function DayPage({ day, onRetry, onEarningSelect, onIpoSelect, onSymbolClick }) {
    if (day.status === 'loading' || day.status === 'idle') return <p className="floor-empty">Loading…</p>
    if (day.status === 'error') {
        return <p className="floor-empty">Couldn’t load this day. <button type="button" className="cal-link" onClick={onRetry}>Try again</button></p>
    }
    const { earnings, fed, ipo } = day.data
    if (!earnings.length && !fed.length && !ipo.length) return <p className="floor-empty">Nothing scheduled on this day.</p>

    // Fed first: a handful of lines that move the whole market. Then the listings, then the
    // earnings — the long list, biggest companies first, read from the top.
    const sections = [
        { key: 'fed',      title: 'Fed',      items: fed,      onSelect: undefined },
        { key: 'ipo',      title: 'IPOs',     items: ipo,      onSelect: onIpoSelect },
        { key: 'earnings', title: 'Earnings', items: earnings, onSelect: onEarningSelect },
    ].filter(s => s.items.length)

    return sections.map(s => (
        <section key={s.key} className="cal-day__sec">
            <h3 className="cal-day__head">{s.title} <span className="cal-day__count">({s.items.length})</span></h3>
            <CalendarRows kind={s.key} items={s.items} dated={false} onSelect={s.onSelect} onSymbolClick={onSymbolClick} />
        </section>
    ))
}
DayPage.propTypes = {
    day:             PropTypes.object.isRequired,
    onRetry:         PropTypes.func.isRequired,
    onEarningSelect: PropTypes.func,
    onIpoSelect:     PropTypes.func,
    onSymbolClick:   PropTypes.func,
}
