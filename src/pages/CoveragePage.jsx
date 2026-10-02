import PropTypes from 'prop-types'
import { EntityPopupShell } from '../cmps/EntityCard/EntityPopupShell.jsx'
import { CoverageCard } from '../cmps/Radar/CoverageBook.jsx'
import { useEntityPopup } from '../customHooks/useEntityPopup.js'
import { analystService } from '../services/analyst/analyst.service.remote.js'
import { eventBus, OPEN_COVERAGE } from '../services/event-bus.service'
import '../cmps/Radar/CoverageBook.scss'

// ── One thesis, on a phone ───────────────────────────────────────────────────
//
// The coverage book lives in the workspace's RIGHT column, and under 767px that column is
// display:none. A Prometheus card saying "the re-model of TSLA is in — read the revised thesis"
// had nowhere visible to send a phone, so the click switched an invisible tab and looked dead
// (2026-10-02). This is the read it was offering, on the in-app detail surface (EntityDetailHost)
// that already carries setups and ideas there.
//
// It is the book's own card, opened — not a second rendering of a thesis that could drift from it.
// Edit is the book's pencil: it leaves the page and runs the same revise doorway the verdict card
// does (MainPage's OPEN_COVERAGE, mode 'revise'), so the Prometheus desk the user lands on is the
// visible column. Retire and delete stay in the book: destructive, rare, and not what this card asked.
export function CoveragePage({ entityId = null, onClose = null }) {
    const { entity: cov, error } = useEntityPopup('coverage', analystService.getCoverage, { notFound: 'Coverage not found', id: entityId })

    if (error || !cov) return <EntityPopupShell error={error} loading={!cov} onClose={onClose} />

    function handleRevise(doc) {
        onClose?.()
        eventBus.emit(OPEN_COVERAGE, { coverageId: doc.id, symbol: doc.symbol, mode: 'revise' })
    }

    return (
        <EntityPopupShell className="coverage-page" onClose={onClose} asset={cov.symbol} meta={[cov.sector ?? null, cov.industry ?? null]}>
            <div className="coverage-book" style={{ overflowY: 'auto', minHeight: 0, flex: 1 }}>
                <CoverageCard c={cov} defaultOpen onEdit={handleRevise} />
            </div>
        </EntityPopupShell>
    )
}

CoveragePage.propTypes = {
    entityId: PropTypes.string,
    onClose:  PropTypes.func,
}
