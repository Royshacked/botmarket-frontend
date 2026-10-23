import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { DetailPanel } from '../DetailPanel/DetailPanel.jsx'
import { useDetailPanel, closePanel } from '../DetailPanel/detailPanel.store.js'
import { strategyService } from '../../services/strategy/strategy.service.remote.js'
import { AssessmentDetail } from '../Radar/AssessmentView.jsx'
import { ThemeDetail } from '../Radar/ThemesView.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { VERDICT_LABEL, verdictKey } from '../Radar/assessmentWords.js'
import { CoverageActions } from '../Radar/CoverageActions.jsx'
import { CoverageDetail, CoverageMeta, CoverageRating } from './CoverageDetail.jsx'
import { PriceTarget } from '../PriceTarget/PriceTarget.jsx'
import {
    WINDOWS, DEFAULT_WINDOW, windowOf, FILTERS, badgeOf, tileVerdict, moveOf, heatLevel, pctText, isStale,
    matchesFilter, groupBySector, sectorLine, capText, mapThemes, themeMove,
} from './forecastMap.utils.js'
import '../Radar/IndustryView.scss'

// FORECASTS — one Floor desk that opens a heat map in the detail panel (Roy, 2026-10-14).
//
// It replaced two desks: Forecasts (Pythia's board as a list in the narrow column) and Analyst companies (the
// coverage book). Three levels, each REPLACING the last in the one panel, with a back arrow — the Calendar's shape:
//   the map      every GICS sub-industry as a tile, by sector: coloured by its move against the market over the
//                chosen window (3 months by default), Pythia's verdict a badge on it
//   an industry  Pythia's thesis (the board's own detail), then its companies, largest first, marked where
//                Prometheus covers them
//   a company    Prometheus's thesis, with the coverage actions the old desk carried
// A card that names a covered ticker (OPEN_COVERAGE) opens straight on that company — `focus`.
// THEMES (Roy, 2026-10-23): Pythia's approved themes are a row of tiles above the sectors, coloured by their direct
// links' move; a theme opens its page here (the board's own ThemeDetail), and each link opens that industry, whose
// back arrow returns to the theme (`from`).

export const FORECAST_PANEL_ID = 'forecasts'

const MAP = { level: 'map' }

/** The view a card's focus asks for: a company by ticker, an industry by its GICS code — or null. Pure. */
function focusView(focus) {
    const sym = String(focus?.symbol ?? '').toUpperCase().trim()
    if (sym) return { level: 'company', symbol: sym }
    const code = String(focus?.code ?? '').trim()
    return code ? { level: 'industry', code } : null
}

export function ForecastPanel({ coverage = [], themes = [], focus = null, onOpenBoard, onEditCoverage, onRetireCoverage, onDeleteCoverage }) {
    const { isOpen } = useDetailPanel(FORECAST_PANEL_ID)
    const isAdmin = Boolean(useAuth()?.isAdmin)
    const [view, setView] = useState(MAP)
    const [win, setWin] = useState(DEFAULT_WINDOW)
    const [filter, setFilter] = useState('all')
    const [map, setMap] = useState({ status: 'idle', data: null })
    const [companies, setCompanies] = useState({ code: null, status: 'idle', data: null })
    const [retry, setRetry] = useState(0)
    // Companies already read while the panel is open — back and forth between industries must not refetch.
    const seen = useRef(new Map())

    // Every open starts on the map — unless a card asked for a company (`focus.symbol`: OPEN_COVERAGE) or an industry
    // (`focus.code`: Pythia's "industry changed" card, 2026-10-22 — it used to open the bare map and leave the user to
    // find the tile), which may arrive just before or just after the open. Decided in render, as the Calendar does, so
    // no effect paints the old view first.
    const [wasOpen, setWasOpen] = useState(isOpen)
    const [seenFocus, setSeenFocus] = useState(focus)
    const [pending, setPending] = useState(null)
    let pend = pending
    if (focus !== seenFocus) {
        setSeenFocus(focus)
        const target = focusView(focus)
        if (target) {
            if (isOpen && wasOpen) { setView(target); pend = null }
            else pend = target
        }
    }
    if (isOpen !== wasOpen) {
        setWasOpen(isOpen)
        if (isOpen) { setView(pend ?? MAP); pend = null }
    }
    if (pend !== pending) setPending(pend)

    useEffect(() => { if (!isOpen) seen.current.clear() }, [isOpen])

    // The map is read on every open — it is one light request, and a board left open across a weekly run should
    // not need a reload to show it.
    useEffect(() => {
        if (!isOpen) return
        let live = true
        setMap(m => ({ status: 'loading', data: m.data }))
        strategyService.getForecastMap().then(
            data => { if (live) setMap({ status: 'ok', data }) },
            () => { if (live) setMap(m => ({ status: 'error', data: m.data })) },
        )
        return () => { live = false }
    }, [isOpen, retry])

    const tiles = map.data?.tiles ?? []
    const coveredAt = map.data?.covered_at ?? {}
    // A company opened from a card carries no industry; the map says where it lives once it has loaded.
    const code = view.level === 'industry' ? view.code : view.level === 'company' ? (view.code ?? coveredAt[view.symbol] ?? null) : null
    const tile = code ? tiles.find(t => t.code === code) ?? null : null

    useEffect(() => {
        if (!isOpen || view.level !== 'industry' || !code) return
        const cached = seen.current.get(code)
        if (cached) { setCompanies({ code, status: 'ok', data: cached }); return }
        let live = true
        setCompanies({ code, status: 'loading', data: null })
        strategyService.getIndustryCompanies(code).then(
            data => { if (!live) return; seen.current.set(code, data); setCompanies({ code, status: 'ok', data }) },
            () => { if (live) setCompanies({ code, status: 'error', data: null }) },
        )
        return () => { live = false }
    }, [isOpen, view.level, code, retry])

    // Each step starts at its top: the panel body is one scroller across the three levels, and a company opened from
    // far down an industry's list otherwise opened mid-thesis (live drive 2026-10-14).
    const bodyRef = useRef(null)
    const viewKey = `${view.level}|${view.code ?? ''}|${view.symbol ?? ''}|${view.id ?? ''}`
    useEffect(() => { bodyRef.current?.closest('.detail-panel__body')?.scrollTo?.(0, 0) }, [viewKey])

    const bySymbol = new Map(coverage.map(c => [String(c?.symbol ?? '').toUpperCase(), c]))
    const back = (label, to) => <button type="button" className="cal-nav__btn" onClick={() => setView(to)}>‹ {label}</button>
    const shownThemes = mapThemes(themes)
    // An industry opened from a theme's link remembers the theme (`from`), so its back arrow — and its companies' —
    // return there rather than to the map.
    const from = view.from ?? null
    const fromTheme = from ? shownThemes.find(t => t.id === from.id) ?? null : null
    const backToStart = () => (from ? back(fromTheme?.name ?? 'Theme', from) : back('Map', MAP))

    let title, meta = null, actions, body
    if (view.level === 'theme') {
        const theme = shownThemes.find(t => t.id === view.id) ?? null
        const a = theme?.assessment
        title = theme?.name ?? 'Theme'
        meta = <>{a && <VerdictChips row={a} />}<span>{(theme?.links ?? []).length} links</span></>
        actions = <div className="cal-nav">{back('Map', MAP)}</div>
        body = theme
            ? <ThemeDetail theme={theme} isAdmin={isAdmin} onPickLink={c => setView({ level: 'industry', code: c, from: { level: 'theme', id: theme.id } })} />
            : <p className="fm-note">This theme is no longer on the house list.</p>
    } else if (view.level === 'company') {
        const cov = bySymbol.get(view.symbol) ?? null
        title = view.symbol
        meta = cov ? <CoverageMeta coverage={cov} /> : null
        // Edit opens Prometheus IN the chat column — the one this panel covers — so it closes the panel first.
        const edit = onEditCoverage && (c => { closePanel(); onEditCoverage(c) })
        actions = (
            <div className="cal-nav">
                {cov && <CoverageActions coverage={cov} onEdit={edit} onRetire={onRetireCoverage} onDelete={onDeleteCoverage} />}
                {code ? back(tile?.name ?? 'Industry', { level: 'industry', code, from }) : back('Map', MAP)}
            </div>
        )
        body = cov ? <CoverageDetail coverage={cov} /> : <p className="fm-note">Prometheus has no thesis on {view.symbol}.</p>
    } else if (view.level === 'industry') {
        title = tile?.name ?? companies.data?.name ?? 'Industry'
        const a = tile?.assessment
        meta = a ? <VerdictChips row={a} /> : null
        actions = <div className="cal-nav">{backToStart()}</div>
        body = (
            <IndustryPage tile={tile} companies={companies.code === code ? companies : { code, status: 'loading', data: null }} onRetry={() => setRetry(n => n + 1)}
                onPick={sym => setView({ level: 'company', code, symbol: sym, from })} bySymbol={bySymbol} />
        )
    } else {
        title = 'Industries'
        actions = (
            <div className="cal-nav">
                <div className="cal-nav" role="group" aria-label="Move window">
                    {WINDOWS.map(w => (
                        <button key={w.key} type="button" className={`cal-nav__btn${win === w.key ? ' cal-nav__btn--on' : ''}`}
                            aria-pressed={win === w.key} onClick={() => setWin(w.key)} title={`Colour by the ${w.long} move against the S&P`}>
                            {w.label}
                        </button>
                    ))}
                </div>
                {/* Pythia's full board — track record, the week, themes, structure, Assess now. It opens in the
                    lists column (FloorLists' `board` desk), so the panel closes on the way. */}
                {onOpenBoard && (
                    <button type="button" className="cal-nav__btn" onClick={() => { closePanel(FORECAST_PANEL_ID); onOpenBoard() }}
                        title="Pythia's board: track record, the week, themes, structure">
                        Board
                    </button>
                )}
            </div>
        )
        body = (
            <HeatMap map={map} tiles={tiles} themes={shownThemes} win={win} filter={filter} onFilter={setFilter} onRetry={() => setRetry(n => n + 1)}
                onPick={c => setView({ level: 'industry', code: c })} onPickTheme={id => setView({ level: 'theme', id })}
                onPickSymbol={sym => setView({ level: 'company', symbol: sym })} />
        )
    }

    return (
        <DetailPanel id={FORECAST_PANEL_ID} kicker="Forecasts" title={title} meta={meta} actions={actions} className="cal-panel fm-panel" container bare>
            <div ref={bodyRef}>{body}</div>
        </DetailPanel>
    )
}
ForecastPanel.propTypes = {
    coverage:         PropTypes.array,
    // Pythia's themes (useCalendarEvents) — the approved ones are a row above the sectors.
    themes:           PropTypes.array,
    // `{ symbol }` — a fresh object per ask (a card pressed twice is two asks).
    focus:            PropTypes.object,
    // Opens Pythia's board in the lists column (FloorLists).
    onOpenBoard:      PropTypes.func,
    onEditCoverage:   PropTypes.func,
    onRetireCoverage: PropTypes.func,
    onDeleteCoverage: PropTypes.func,
}

function VerdictChips({ row }) {
    const v = verdictKey(row.verdict)
    return (
        <>
            <span className={`assessment-view__verdict assessment-view__verdict--${v}`}>{VERDICT_LABEL[row.verdict] ?? row.verdict}</span>
            <span>{v === 'watch' && row.decides_by ? `decides by ${row.decides_by}` : row.horizon}</span>
            {row.confidence && <span>{row.confidence} confidence</span>}
        </>
    )
}
VerdictChips.propTypes = { row: PropTypes.object.isRequired }

/** A theme as a map tile: the industry Tile's shape, its move the mean of its links' tiles (themeMove). Pure. */
function themeTile(theme, tilesByCode) {
    const moves = Object.fromEntries(WINDOWS.map(w => [w.key, themeMove(theme, tilesByCode, w.key)]))
    return { code: theme.id, name: theme.name, assessment: theme.assessment ?? null, moves: { ...moves, hype: Boolean(theme.assessment?.moved?.hype) }, covered: 0 }
}

function HeatMap({ map, tiles, themes = [], win, filter, onFilter, onRetry, onPick, onPickTheme, onPickSymbol }) {
    const w = windowOf(win)
    if (map.status === 'error' && !map.data) {
        return <p className="fm-note">Couldn’t load the map. <button type="button" className="cal-link" onClick={onRetry}>Try again</button></p>
    }
    if (!map.data) return <p className="fm-note" role="status">Loading the map…</p>
    const sectors = groupBySector(tiles)
    const unmapped = map.data.unmapped ?? []
    const tilesByCode = new Map(tiles.map(t => [t.code, t]))
    const themeTiles = themes.map(t => themeTile(t, tilesByCode))
    return (
        <div className="fm-map">
            <div className="fm-filters" role="group" aria-label="Verdict filter">
                {FILTERS.map(f => (
                    <button key={f.key} type="button" className={`fm-filter${filter === f.key ? ' fm-filter--on' : ''}`}
                        aria-pressed={filter === f.key} onClick={() => onFilter(f.key)}>{f.label}</button>
                ))}
            </div>
            <p className="fm-note">
                Colour: the {w.long} move against the S&amp;P{map.data.asof ? `, as of ${map.data.asof}` : ''}. Letter: Pythia’s verdict
                (S swing · L long term · W watch · A avoid), bolder with more confidence. Striped: the hype flag. Faded: due for reassessment.
            </p>
            {themeTiles.length > 0 && (
                <section className="fm-sector fm-sector--themes" aria-label="Themes">
                    <h3 className="fm-sector__head">
                        Themes
                        <span className="fm-sector__line">value chains across industries · coloured by their direct links</span>
                    </h3>
                    <div className="fm-grid">
                        {themeTiles.map(t => <Tile key={t.code} tile={t} win={w} dim={!matchesFilter(t, filter)} onPick={onPickTheme} />)}
                    </div>
                </section>
            )}
            {sectors.map(s => (
                <section key={s.sector} className="fm-sector" aria-label={s.sector}>
                    <h3 className="fm-sector__head">
                        {s.sector}
                        {sectorLine(s) && <span className="fm-sector__line">{sectorLine(s)}</span>}
                    </h3>
                    <div className="fm-grid">
                        {s.tiles.map(t => <Tile key={t.code} tile={t} win={w} dim={!matchesFilter(t, filter)} onPick={onPick} />)}
                    </div>
                </section>
            ))}
            {unmapped.length > 0 && (
                <section className="fm-sector" aria-label="Covered, not on the map">
                    <h3 className="fm-sector__head">Covered, not on the map<span className="fm-sector__line">no GICS sub-industry on file</span></h3>
                    <div className="fm-syms">
                        {unmapped.map(sym => <button key={sym} type="button" className="fm-filter" onClick={() => onPickSymbol(sym)}>{sym}</button>)}
                    </div>
                </section>
            )}
        </div>
    )
}
HeatMap.propTypes = {
    map: PropTypes.object.isRequired, tiles: PropTypes.array.isRequired, themes: PropTypes.array, win: PropTypes.string.isRequired, filter: PropTypes.string.isRequired,
    onFilter: PropTypes.func.isRequired, onRetry: PropTypes.func.isRequired, onPick: PropTypes.func.isRequired, onPickTheme: PropTypes.func.isRequired,
    onPickSymbol: PropTypes.func.isRequired,
}

function Tile({ tile: t, win, dim, onPick }) {
    const v = moveOf(t, win.key)
    const lvl = heatLevel(v, win.scale)
    const badge = badgeOf(t)
    const verdict = tileVerdict(t)
    const conf = t.assessment?.confidence ?? null
    const stale = isStale(t)
    const heat = lvl == null ? 'none' : lvl > 0 ? `up-${lvl}` : lvl < 0 ? `down-${-lvl}` : 'flat'
    const cls = ['fm-tile', `fm-tile--${heat}`, t.moves?.hype && 'fm-tile--hype', stale && 'fm-tile--stale', dim && 'fm-tile--dim'].filter(Boolean).join(' ')
    const tip = [
        t.name, t.industry && t.industry !== t.name ? t.industry : null,
        `${win.label} vs S&P ${pctText(v)}`,
        verdict ? `${VERDICT_LABEL[verdict] ?? verdict}${conf ? ` (${conf} confidence)` : ''}` : 'Not assessed',
        t.assessment?.thesis ?? null, stale ? 'Due for reassessment' : null,
    ].filter(Boolean).join('\n')
    return (
        <button type="button" className={cls} onClick={() => onPick(t.code)} title={tip} data-code={t.code}>
            <span className="fm-tile__name">{t.name}</span>
            <span className="fm-tile__foot">
                <span className="fm-tile__move">{pctText(v)}</span>
                {t.covered > 0 && <span className="fm-tile__cov" title={`${t.covered} covered by Prometheus`}>◆{t.covered}</span>}
            </span>
            {badge && <span className={`fm-tile__badge fm-tile__badge--${verdict} fm-tile__badge--${conf ?? 'low'}`} aria-label={VERDICT_LABEL[verdict]}>{badge}</span>}
        </button>
    )
}
Tile.propTypes = { tile: PropTypes.object.isRequired, win: PropTypes.object.isRequired, dim: PropTypes.bool, onPick: PropTypes.func.isRequired }

function IndustryPage({ tile, companies, onRetry, onPick, bySymbol }) {
    const a = tile?.assessment ?? null
    const m = tile?.moves ?? null
    const list = companies.data?.companies ?? []
    return (
        <div className="fm-industry">
            <section className="fm-industry__sec">
                <h3 className="fm-sector__head">Pythia</h3>
                {a ? <AssessmentDetail row={a} open /> : <p className="fm-note">Pythia has not assessed this industry yet.</p>}
                {m && (
                    <p className="fm-note">
                        Against the S&amp;P: {WINDOWS.map(w => `${w.label} ${pctText(m[w.key])}`).join(' · ')}{m.hype ? ' · hype flag' : ''}{m.asof ? ` (as of ${m.asof})` : ''}
                    </p>
                )}
            </section>
            <section className="fm-industry__sec">
                <h3 className="fm-sector__head">
                    Companies
                    {companies.data?.level && companies.data.level !== 'sub_industry' && (
                        <span className="fm-sector__line">too few of its own — {companies.data.level.replace('_', ' ')}: {companies.data.level_name}</span>
                    )}
                </h3>
                {companies.status === 'loading' && <p className="fm-note" role="status">Loading companies…</p>}
                {companies.status === 'error' && <p className="fm-note">Couldn’t load the companies. <button type="button" className="cal-link" onClick={onRetry}>Try again</button></p>}
                {companies.status === 'ok' && !list.length && <p className="fm-note">No companies classified here.</p>}
                {list.length > 0 && (
                    <ul className="fm-cos">
                        {list.map(c => {
                            const cov = c.covered ? bySymbol.get(c.symbol) ?? null : null
                            const inner = (
                                <>
                                    <span className="fm-co__sym">{c.symbol}</span>
                                    <span className="fm-co__name">{c.name}</span>
                                    <span className="fm-co__cap">{capText(c.market_cap)}</span>
                                    {c.covered
                                        ? <span className="fm-co__cov">{cov && <CoverageRating coverage={cov} />}{cov && <PriceTarget priceTarget={cov.price_target} gap={cov.gap} label={null} />}{!cov?.rating && 'covered'}</span>
                                        : <span className="fm-co__none">not covered</span>}
                                </>
                            )
                            return (
                                <li key={c.symbol}>
                                    {c.covered
                                        ? <button type="button" className="fm-co fm-co--covered" onClick={() => onPick(c.symbol)} title="Read Prometheus’s thesis">{inner}</button>
                                        : <div className="fm-co">{inner}</div>}
                                </li>
                            )
                        })}
                    </ul>
                )}
            </section>
        </div>
    )
}
IndustryPage.propTypes = {
    tile: PropTypes.object, companies: PropTypes.object.isRequired, onRetry: PropTypes.func.isRequired,
    onPick: PropTypes.func.isRequired, bySymbol: PropTypes.instanceOf(Map).isRequired,
}
