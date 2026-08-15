import PropTypes from 'prop-types'
import './PositionPanel.scss'

// The monitor's view of a live (or finished) trade — entry, working stop, R, the target ladder and
// what has been banked. Written for a Kairos call, shared with a Mentor setup the moment the setup
// pop-out needed the same box: `position_state` is one shape whatever desk filled it in, so this is
// mechanism and belongs in one place (CLAUDE.md, shared mechanism → one service).
//
// NOT the same view as PopoutFooter's, which is deliberately next to it on both pages. That one is
// the BROKER's: what is open, at what size, worth what right now, with the button that closes it.
// This one is the PLAN's — how far the trade has come in multiples of the risk it was opened with,
// where the protection sits now versus where it started, and which targets are still ahead. A user
// asking "am I up?" wants the footer; one asking "is this working?" wants this.
//
// The classes were `.call-position` while a call was the only caller. Renamed with the move, on the
// precedent MonitorJournal set — the styles follow the component, not the page that happened to have
// it first, and a shared box named after one of its two callers reads as a mistake later.

const fmtR = r => (r == null ? '—' : `${r > 0 ? '+' : ''}${r}R`)

/**
 * One rung of the target ladder, which is TWO different things depending on what the desk authored.
 *
 * A WINDOW (`resting` present and above/below `price`) is Mentor's TP window: the limit rests at the
 * price the user named and Talos wakes at the near edge to offer a partial on the way. Both numbers
 * matter and showing only one is how the user ends up thinking the trade exits where it merely
 * starts a conversation.
 *
 * A LEVEL is everything else — a call's target, a legacy rung, or a zero-width band the user asked
 * to be taken without discussion. One number, because there is only one.
 *
 * `hit_at` means different things across the two, and it is read off the shape rather than off a
 * kind flag: on a window it means Talos ASKED (the limit is still out there unfilled), on a level it
 * means the target was reached.
 */
function TargetRung({ t }) {
    const resting  = Number.isFinite(t?.resting) ? t.resting : null
    const wake     = Number.isFinite(t?.price) ? t.price : null
    const windowed = resting != null && wake != null && wake !== resting
    const done     = t?.hit_at != null

    if (windowed) {
        return (
            <span
                className={`position-panel__target${done ? ' is-asked' : ''}`}
                title={`Talos offers a partial from ${wake}; the limit rests at ${resting}${done ? ' — already asked on this visit' : ''}`}
            >
                {wake} <i>→</i> {resting}{done ? ' ·' : ''}
            </span>
        )
    }

    const level = resting ?? wake
    return (
        <span
            className={`position-panel__target${done ? ' is-hit' : ''}`}
            title={resting != null && wake == null ? 'An exact level — it rests at the broker and is taken without asking' : undefined}
        >
            {level ?? '—'}{done ? ' ✓' : ''}
        </span>
    )
}
TargetRung.propTypes = { t: PropTypes.object.isRequired }

export function PositionPanel({ ps, status }) {
    const e = ps.entry ?? {}, s = ps.stop ?? {}, m = ps.metrics ?? {}, o = ps.outcome
    const targets = Array.isArray(ps.targets) ? ps.targets : []
    const taken   = Array.isArray(ps.taken) ? ps.taken : []
    const closed  = status === 'closed'
    return (
        <div className={`position-panel position-panel--${status}`}>
            <div className="position-panel__grid">
                <div className="position-panel__cell"><span>Entry</span><b>{e.fill_price ?? e.intended ?? '—'}</b></div>
                <div className="position-panel__cell"><span>Stop</span><b>{s.current ?? '—'}</b>{s.initial != null && s.initial !== s.current && <em> (init {s.initial})</em>}</div>
                <div className="position-panel__cell"><span>Size</span><b>{e.size ?? '—'}</b></div>
                {!closed && <div className="position-panel__cell"><span>R now</span><b className={m.r_multiple_now > 0 ? 'pos' : m.r_multiple_now < 0 ? 'neg' : ''}>{fmtR(m.r_multiple_now)}</b></div>}
                {!closed && ps.phase && <div className="position-panel__cell"><span>Phase</span><b>{ps.phase}</b></div>}
                {!closed && (m.mfe != null || m.mae != null) && <div className="position-panel__cell"><span>MFE / MAE</span><b>{fmtR(m.mfe)} / {fmtR(m.mae)}</b></div>}
            </div>

            {targets.length > 0 && (
                <div className="position-panel__targets">
                    <span className="position-panel__label">Targets</span>
                    {/* Keyed by index: a rung has no id, and its price MOVES (a let_run walks the
                        window out to a new level), so keying on the price would remount the row on
                        the one change worth animating. */}
                    {targets.map((t, i) => <TargetRung key={i} t={t} />)}
                </div>
            )}

            {taken.length > 0 && (
                <div className="position-panel__taken">
                    <span className="position-panel__label">Taken</span>
                    {taken.map((t, i) => <span key={i} className="position-panel__taken-row">{t.kind} {t.size ?? ''}{t.r_multiple != null ? ` · ${fmtR(t.r_multiple)}` : ''}</span>)}
                </div>
            )}

            {closed && o && (
                <div className={`position-panel__outcome ${o.r_multiple > 0 ? 'is-win' : o.r_multiple < 0 ? 'is-loss' : ''}`}>
                    <span className="position-panel__outcome-reason">{o.reason}</span>
                    <span className="position-panel__outcome-r">{fmtR(o.r_multiple)}</span>
                    {o.exit_price != null && <span className="position-panel__outcome-bit">exit {o.exit_price}</span>}
                    {o.pnl != null && <span className="position-panel__outcome-bit">P&amp;L {o.pnl}</span>}
                </div>
            )}
        </div>
    )
}
PositionPanel.propTypes = { ps: PropTypes.object.isRequired, status: PropTypes.string }
