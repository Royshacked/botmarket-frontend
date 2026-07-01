import { useEffect, useState } from 'react'
import { paperService } from '../../services/paper/paper.service.remote.js'

/**
 * Paper trading control + results, rendered inside UserProfile.
 * Global toggle (routes new ideas to the simulated broker), account-size + cost config,
 * a live equity/P&L readout, and recent simulated trades. Reuses user-profile__* styles.
 */
const money = (n, ccy = 'USD') =>
    n == null ? '—' : `${n < 0 ? '-' : ''}${ccy === 'USD' ? '$' : ''}${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`

const pnlColor = n => (n > 0 ? 'var(--color-long)' : n < 0 ? 'var(--color-short)' : 'var(--text-secondary)')

const DEFAULT_STATE = { enabled: false, settings: {}, account: {} }

export function PaperTradingSection() {
    const [state,   setState]   = useState(DEFAULT_STATE)
    const [trades,  setTrades]  = useState([])
    const [busy,    setBusy]    = useState(false)
    const [error,   setError]   = useState(null)
    const [draftBalance, setDraftBalance] = useState('')

    useEffect(() => { _load() }, [])

    async function _load() {
        try {
            const [st, tr] = await Promise.all([
                paperService.getState(),
                paperService.getTrades({ limit: 25 }),
            ])
            setState(st)
            setTrades(tr)
            setDraftBalance(String(st.account?.startingBalance ?? ''))
            setError(null)
        } catch (err) {
            // Still render the section so it's discoverable; surface the reason.
            setError(err?.response?.status === 404
                ? 'Paper API not found — restart the backend to enable it.'
                : 'Could not load paper account.')
        }
    }

    async function _apply(fn) {
        setBusy(true)
        try { setState(await fn()) } finally { setBusy(false) }
    }

    const toggle      = () => _apply(() => paperService.setMode(!state.enabled))
    const setSpread   = v => _apply(() => paperService.updateSettings({ spreadBps: Number(v) }))
    const setCommission = v => _apply(() => paperService.updateSettings({ commissionPerTrade: Number(v) }))

    async function reset() {
        if (!window.confirm('Reset the paper account? This clears all simulated positions, orders and P&L.')) return
        await _apply(async () => {
            const st = await paperService.reset(draftBalance ? Number(draftBalance) : undefined)
            setTrades(await paperService.getTrades({ limit: 25 }))
            return st
        })
    }

    const a   = state.account ?? {}
    const ccy = a.currency ?? 'USD'
    const s   = state.settings ?? {}

    return (
        <section className="user-profile__section">
            <h2 className="user-profile__section-title">Paper Trading</h2>

            {error && (
                <p style={{ fontSize: '0.78rem', color: 'var(--color-warning, #e6a817)', marginBottom: 8 }}>{error}</p>
            )}

            {/* Mode toggle */}
            <div className="user-profile__row user-profile__row--inline">
                <span className="user-profile__label">
                    Simulation mode
                    <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 2 }}>
                        New ideas route to a simulated account
                    </span>
                </span>
                <button
                    className={`user-profile__btn ${state.enabled ? 'user-profile__btn--primary' : 'user-profile__btn--ghost'}`}
                    onClick={toggle}
                    disabled={busy}
                >
                    {state.enabled ? 'On' : 'Off'}
                </button>
            </div>

            {/* Live results readout */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '12px 0' }}>
                <Stat label="Equity"        value={money(a.equity, ccy)} />
                <Stat label="Realized P&L"  value={money(a.realizedPnl, ccy)} color={pnlColor(a.realizedPnl)} />
                <Stat label="Unrealized"    value={money(a.unrealized, ccy)} color={pnlColor(a.unrealized)} />
                <Stat label="Cash"          value={money(a.cashBalance, ccy)} />
                <Stat label="Open"          value={a.openPositions ?? 0} />
                <Stat label="Start"         value={money(a.startingBalance, ccy)} />
            </div>

            {/* Account size + costs */}
            <div className="user-profile__row user-profile__row--inline">
                <span className="user-profile__label">Starting balance</span>
                <input
                    className="user-profile__input"
                    style={{ width: '8rem' }}
                    type="number"
                    value={draftBalance}
                    onChange={e => setDraftBalance(e.target.value)}
                />
            </div>
            <div className="user-profile__row user-profile__row--inline">
                <span className="user-profile__label">Spread (bps)</span>
                <input
                    className="user-profile__input"
                    style={{ width: '6rem' }}
                    type="number"
                    defaultValue={s.spreadBps ?? 0}
                    disabled={busy}
                    onBlur={e => setSpread(e.target.value)}
                />
            </div>
            <div className="user-profile__row user-profile__row--inline">
                <span className="user-profile__label">Commission / trade</span>
                <input
                    className="user-profile__input"
                    style={{ width: '6rem' }}
                    type="number"
                    defaultValue={s.commissionPerTrade ?? 0}
                    disabled={busy}
                    onBlur={e => setCommission(e.target.value)}
                />
            </div>
            <button className="user-profile__btn user-profile__btn--danger" onClick={reset} disabled={busy}>
                Reset account
            </button>

            {/* Recent simulated trades */}
            <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', margin: '16px 0 8px' }}>
                Recent trades
            </h3>
            {trades.length === 0
                ? <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>No simulated trades yet.</p>
                : <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 280, overflowY: 'auto' }}>
                    {trades.map(t => <TradeRow key={t.tradeId} t={t} ccy={ccy} />)}
                  </div>
            }
        </section>
    )
}

function Stat({ label, value, color }) {
    return (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px' }}>
            <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)' }}>{label}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', fontWeight: 700, color: color ?? 'var(--text-primary)' }}>{value}</div>
        </div>
    )
}

function TradeRow({ t, ccy }) {
    const pnl  = t.exit?.realizedPnl
    const open = t.status === 'open'
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', fontFamily: 'var(--font-mono)', padding: '4px 8px', background: 'var(--bg-surface)', borderRadius: 4 }}>
            <span style={{ fontWeight: 700, minWidth: 56 }}>{t.symbol}</span>
            <span style={{ color: t.direction === 'long' ? 'var(--color-long)' : 'var(--color-short)' }}>
                {t.direction === 'long' ? '↑' : '↓'}
            </span>
            <span style={{ color: 'var(--text-secondary)' }}>
                {t.entry?.price ?? '?'}{!open && t.exit?.price != null ? ` → ${t.exit.price}` : ''}
            </span>
            <span style={{ marginLeft: 'auto', color: open ? 'var(--text-dim)' : pnlColor(pnl), fontWeight: 700 }}>
                {open ? 'open' : money(pnl, ccy)}
            </span>
            {!open && t.exit?.reason && (
                <span style={{ color: 'var(--text-dim)', fontSize: '0.68rem', textTransform: 'uppercase' }}>{t.exit.reason}</span>
            )}
        </div>
    )
}
