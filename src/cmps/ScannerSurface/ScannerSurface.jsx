import PropTypes from 'prop-types'

// ── Argus's surface — the single-pick hand-off only (2026-11-09) ─────────────
//
// Roy archived Argus's list-building chat and the scan list (archive/cmps/ScannerSurface/ holds the old surface: the
// list in progress, the lens, the angle chips, the Prometheus read of a radar cut and the Generate / Update / Later
// bar). What is left is the one job Mentor still sends a user here for: find ONE name to trade. The pick goes back to
// Mentor by itself through the chain (the server's `argus_pick` → Mentor's first turn), so there is nothing to press
// here — the pane only says what is happening.

export function ScannerSurface() {
    return (
        <div className="desk-surface scanner-surface">
            <p className="desk-surface__lead">
                Argus is finding one name to trade — it goes on to Mentor by itself once it is settled.
            </p>
        </div>
    )
}

// What this pane is, said once under its tabs (SidePane — Roy, 2026-10-19: the pane was not clear to a user).
ScannerSurface.paneHint = 'Argus finds one name for you here and hands it back to Mentor to build.'

ScannerSurface.propTypes = {
    // The pane hands every surface the session and the page's desk props; this one reads neither.
    session:   PropTypes.object,
    deskProps: PropTypes.object,
}
