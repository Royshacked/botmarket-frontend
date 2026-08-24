import PropTypes from 'prop-types'
import { StatusIcon } from '../StatusIcon.jsx'

// The pop-out window's frame — the detail-view counterpart to EntityCard.
//
// Both existing pages pinned themselves to the popup viewport with the same inline root, and
// CallPage's comment said so outright ("Mirror IdeaPage's proven root exactly"). Mirroring by hand
// is how they drift: the flex column has to resolve a real height or the chart pane collapses, and
// that constraint was documented in one file and merely copied into the other.
//
// Same split as everywhere else: the frame, the loading/error states and the header LAYOUT are
// mechanism; which facts go in the header are the kind's own judgment, passed as `meta`.
//
// CLASS NAMES: still `idea-page*`, which CallPage already reused verbatim. As with `.idea-card`,
// that is now the shared shell's name — renaming is a separate cosmetic pass.

const ROOT_STYLE = {
    position: 'fixed', inset: 0,
    display: 'flex', flexDirection: 'column',
    background: 'var(--bg-base)',
    color: 'var(--text-primary)',
    overflow: 'hidden',
}

const CENTRE_STYLE = {
    ...ROOT_STYLE,
    alignItems: 'center', justifyContent: 'center',
    color: 'var(--text-secondary)', fontSize: '1rem',
}

/**
 * @param {string}    [error]      renders the error state instead of the body
 * @param {boolean}   loading      renders the loading state instead of the body
 * @param {ReactNode} [badge]      the owning agent's badge, left of the asset
 * @param {string}    asset
 * @param {string}    [direction]  long / short — colours via `direction--{x}`
 * @param {string[]}  [meta]       header facts, rendered in order (size, horizon, validity…)
 * @param {string}    [status]     drives the header StatusIcon
 * @param {string}    [iconStatus] borrow another kind's icon (a call's `watching` → `looking`)
 * @param {string}    [statusLabel] tooltip on the status icon — the kind's own wording for it
 * @param {ReactNode} [headerExtra] kind-specific header controls
 * @param {ReactNode} [above]      full-width strip between header and body (a dev panel)
 */
export function EntityPopupShell({
    error, loading, badge, asset, direction, meta = [], status, iconStatus, statusLabel,
    headerExtra, above, className = '', children,
}) {
    if (error)   return <div className={`idea-page idea-page--err ${className}`} style={CENTRE_STYLE}>{error}</div>
    if (loading) return <div className={`idea-page idea-page--loading ${className}`} style={CENTRE_STYLE}>Loading…</div>

    return (
        <div className={`idea-page ${className}`} style={ROOT_STYLE}>
            <div className="idea-page__header">
                <span className="idea-page__title">
                    {badge}
                    <span className="idea-page__asset">{asset || '—'}</span>
                    {direction && (
                        <span className={`idea-page__direction direction--${direction}`}>{direction}</span>
                    )}
                    {meta.filter(Boolean).map((m, i) => (
                        <span className="idea-page__meta" key={i}>{m}</span>
                    ))}
                </span>
                {status && (
                    <span className={`idea-page__status status--${iconStatus ?? status}`} title={statusLabel}>
                        <StatusIcon status={iconStatus ?? status} />
                    </span>
                )}
                {headerExtra}
            </div>

            {above}
            {children}
        </div>
    )
}

EntityPopupShell.propTypes = {
    error:       PropTypes.string,
    loading:     PropTypes.bool,
    badge:       PropTypes.node,
    asset:       PropTypes.string,
    direction:   PropTypes.string,
    meta:        PropTypes.array,
    status:      PropTypes.string,
    iconStatus:  PropTypes.string,
    statusLabel: PropTypes.string,
    headerExtra: PropTypes.node,
    above:       PropTypes.node,
    className:   PropTypes.string,
    children:    PropTypes.node,
}
