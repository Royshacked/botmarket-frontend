import { useState, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import { CallDraft } from '../cmps/KairosPanel/KairosPanel.jsx'
import { HermesBadge } from '../cmps/AxlHub/AgentBadges.jsx'
import { StatusIcon } from '../cmps/StatusIcon.jsx'
import { PopoutFooter } from '../cmps/TradeIdeas/PopoutFooter.jsx'
import { TradingViewChart } from '../cmps/TradingViewChart/TradingViewChart.jsx'
import { usePositions } from '../customHooks/usePositions.js'
import { kairosService } from '../services/kairos/kairos.service.remote.js'
import '../cmps/KairosPanel/KairosPanel.scss'   // CallDraft chips/cards
import './IdeaPage.scss'                          // REUSE the idea pop-out shell (header + chart 70 / column 30)
import './CallPage.scss'                          // call-only bits (delete, action row)

const STATUS_LABEL = {
    waiting: 'watching for zone', watching: 'near a zone', ready: 'ready to enter',
    expiring: 'expiring', confirmed: 'entered', expired: 'expired', dismissed: 'dismissed',
}
// Map a call status to the closest idea StatusIcon (waiting→hourglass, watching→radar, …).
const CALL_STATUS_ICON = {
    waiting: 'waiting', watching: 'looking', ready: 'hit',
    confirmed: 'long', expired: 'closed', dismissed: 'closed',
}
// TradingView interval per horizon.
const TF_INTERVAL = { intraday: '5', day: '15', swing: 'D' }

const REASON_LABEL = { closed: 'market closed', scheduled: 'heartbeat', zone_trip: 'in zone', expiry_review: 'expiry review' }

// ── Monitor journal — the running, first-person monologue of every monitor wake ─────────────────
// Timeline is appended oldest→newest by the backend; render chronologically and keep the box
// pinned to the latest entry (chat-style). Cheap heartbeats are one-liners; a real assessment
// carries the model's own read + the four-axis detail.
function JournalAxes({ axes }) {
    const rows = [
        axes?.market       && ['market', axes.market.read,       axes.market.score],
        axes?.news         && ['news',   axes.news.read,         axes.news.score],
        axes?.price_action && ['price',  axes.price_action.read, axes.price_action.strength],
    ].filter(Boolean)
    const pats = Array.isArray(axes?.patterns_seen) ? axes.patterns_seen.filter(p => p?.present) : []
    if (!rows.length && !pats.length) return null
    return (
        <div className="call-journal__axes">
            {rows.map(([k, read, tag]) => (
                <div key={k} className="call-journal__axis">
                    <span className="call-journal__axis-k">{k}</span>
                    {tag && <span className={`call-journal__axis-tag tag--${tag}`}>{tag}</span>}
                    {read && <span className="call-journal__axis-read">{read}</span>}
                </div>
            ))}
            {pats.length > 0 && (
                <div className="call-journal__axis">
                    <span className="call-journal__axis-k">patterns</span>
                    <span className="call-journal__axis-read">{pats.map(p => p.note || p.id).join(' · ')}</span>
                </div>
            )}
        </div>
    )
}
JournalAxes.propTypes = { axes: PropTypes.object }

function JournalEntry({ e }) {
    const time     = e.at ? new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
    const isAssess = e.reason === 'zone_trip' || e.reason === 'expiry_review'
    return (
        <div className={`call-journal__entry call-journal__entry--${e.reason}`}>
            <div className="call-journal__meta">
                <span className="call-journal__time">{time}</span>
                <span className="call-journal__reason">{REASON_LABEL[e.reason] ?? e.reason}</span>
                {e.price != null && <span className="call-journal__price">@ {e.price}</span>}
                {e.verdict && <span className={`call-journal__verdict verdict--${e.verdict}`}>{e.verdict}</span>}
            </div>
            <p className="call-journal__note">{e.note}</p>
            {isAssess && e.fetched && <div className="call-journal__fetched">fetched {e.fetched}</div>}
            {isAssess && <JournalAxes axes={e.axes} />}
        </div>
    )
}
JournalEntry.propTypes = { e: PropTypes.object.isRequired }

function MonitorJournal({ timeline }) {
    const boxRef = useRef(null)
    const list   = Array.isArray(timeline) ? timeline : []
    // Keep pinned to the newest entry as the journal grows (only scrolls the box, not the column).
    useEffect(() => { const el = boxRef.current; if (el) el.scrollTop = el.scrollHeight }, [list.length])
    if (!list.length) {
        return <p className="call-journal__empty">No monitor activity yet — the journal fills in as Kairos wakes to check this call.</p>
    }
    return (
        <div className="call-journal" ref={boxRef}>
            {list.map((e, i) => <JournalEntry key={i} e={e} />)}
        </div>
    )
}
MonitorJournal.propTypes = { timeline: PropTypes.array }

// Pop-out detail window for a Kairos call. Reuses the idea pop-out shell (IdeaPage.scss) — same
// chart-left / column-right layout — with the call form (CallDraft) in the right column instead of
// idea conditions. Data is injected by the opener (window.__callData / localStorage), API fallback.
export function CallPage() {
    const id = window.location.pathname.split('/').at(-1)
    const [call, setCall] = useState(null)
    const [busy, setBusy] = useState(false)
    const [err,  setErr]  = useState(null)
    const { positions, refresh: refreshPositions, closePosition } = usePositions()

    useEffect(() => {
        if (window.__callData?.id === id) { setCall(window.__callData); delete window.__callData; return }
        const cached = localStorage.getItem(`popup-call-${id}`)
        if (cached) {
            try { setCall(JSON.parse(cached)); localStorage.removeItem(`popup-call-${id}`); return }
            catch { /* fall through */ }
        }
        kairosService.listCalls()
            .then(list => { const c = list.find(x => x.id === id); c ? setCall(c) : setErr('Call not found') })
            .catch(() => setErr('Failed to load call'))
    }, [id])

    // Live monitor journal: hydrate the full call (incl. monitor_state.timeline) and poll it while
    // the pop-out is open, so new monitor wakes drop in. Silent on failure (keeps the fast-paint call).
    useEffect(() => {
        let alive = true
        async function pull() { const c = await kairosService.getCall(id); if (alive && c) setCall(c) }
        pull()
        const t = setInterval(pull, 20_000)
        return () => { alive = false; clearInterval(t) }
    }, [id])

    async function refresh() {
        const list = await kairosService.listCalls()
        setCall(list.find(x => x.id === id) ?? null)
    }
    async function act(action) {
        setBusy(true)
        try { await kairosService.actOnCall(id, action); await refresh() }
        catch (e) { console.error('[call-page] act', e) }
        finally { setBusy(false) }
    }
    async function del() {
        setBusy(true)
        try { await kairosService.deleteCall(id); window.close() }
        catch (e) { console.error('[call-page] delete', e); setBusy(false) }
    }

    // Mirror IdeaPage's proven root exactly: pin to the popup viewport so the flex
    // column (header → chart/main → footer) always resolves a real height.
    const rootStyle = { position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-base)', color: 'var(--text-primary)', overflow: 'hidden' }
    const centreStyle = { ...rootStyle, alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '1rem' }

    if (err)   return <div className="idea-page idea-page--err" style={centreStyle}>{err}</div>
    if (!call) return <div className="idea-page idea-page--loading" style={centreStyle}>Loading…</div>

    const a          = call.monitor_state?.last_assessment
    const p          = a?.proposal
    const isReady    = call.status === 'ready'
    const expiring   = call.status === 'expiring'
    const iconStatus = CALL_STATUS_ICON[call.status] ?? call.status

    // Positions on this asset (a confirmed call becomes a real idea with a position).
    const callSymbols   = [call.asset, call.broker_symbol].filter(Boolean).map(s => String(s).toUpperCase())
    const callPositions = positions.filter(p => p.symbol && callSymbols.includes(String(p.symbol).toUpperCase()))

    return (
        <div className="idea-page" style={rootStyle}>
            <div className="idea-page__header">
                <span className="idea-page__title">
                    <HermesBadge size={22} />
                    <span className="idea-page__asset">{call.asset || '—'}</span>
                    {call.bias && <span className={`idea-page__direction direction--${call.bias}`}>{call.bias}</span>}
                    {call.trade_type && <span className="idea-page__meta">{call.trade_type}</span>}
                    {call.sizing?.max_size != null && <span className="idea-page__meta">max {call.sizing.max_size}</span>}
                    {call.valid_until && <span className="idea-page__meta">valid until {new Date(call.valid_until).toLocaleString()}</span>}
                </span>
                <span className={`idea-page__status status--${iconStatus}`} title={STATUS_LABEL[call.status] ?? call.status}>
                    <StatusIcon status={iconStatus} />
                </span>
            </div>

            <div className="idea-dialog__main">
                <div className="idea-dialog__chart">
                    <TradingViewChart symbol={call.asset || 'SPY'} interval={TF_INTERVAL[call.trade_type] ?? '15'} />
                </div>

                <div className="idea-dialog__conditions">
                    {(isReady || expiring) && (
                        <div className="call-page__actions">
                            {isReady && <button className="portfolio-panel__review-btn portfolio-panel__review-btn--update" disabled={busy} onClick={() => act('confirm')}>Confirm entry</button>}
                            {expiring && <button className="portfolio-panel__review-btn portfolio-panel__review-btn--update" disabled={busy} onClick={() => act('edit')}>Accept edit</button>}
                            <button className="portfolio-panel__review-btn portfolio-panel__review-btn--dismiss" disabled={busy} onClick={() => act('dismiss')}>Dismiss</button>
                        </div>
                    )}

                    {call.thesis && (
                        <div className="idea-dialog__field"><span>Thesis</span><p className="idea-dialog__notes">{call.thesis}</p></div>
                    )}

                    <CallDraft call={call} showHead={false} />

                    {isReady && p && (
                        <div className="kairos-panel__card kairos-panel__card--ready">
                            <div className="kairos-panel__card-head"><span className="kairos-panel__card-status">proposed entry</span></div>
                            <div className="kairos-panel__card-row">
                                Entry <b>{p.entry}</b> · Stop <b>{p.stop}</b> · TP <b>{p.take_profit?.[0]?.price ?? '—'}</b> · {p.size} · R:R {p.rr ?? '—'}
                            </div>
                            {p.rationale && <div className="kairos-panel__card-note">{p.rationale}</div>}
                        </div>
                    )}
                    {expiring && a?.edit_proposal?.why && (
                        <div className="kairos-panel__card kairos-panel__card--expiring"><div className="kairos-panel__card-note">{a.edit_proposal.why}</div></div>
                    )}

                    {call.monitor_state?.memo && (
                        <div className="idea-dialog__field"><span>Monitor note</span><p className="idea-dialog__notes">{call.monitor_state.memo}</p></div>
                    )}

                    <div className="idea-dialog__field">
                        <span>Monitor journal <em>(live)</em></span>
                        <MonitorJournal timeline={call.monitor_state?.timeline} />
                    </div>
                </div>
            </div>

            <PopoutFooter
                positions={callPositions}
                closePosition={closePosition}
                onPositionsChanged={refreshPositions}
                onDelete={del}
                deleteTitle="Delete call"
            />
        </div>
    )
}
