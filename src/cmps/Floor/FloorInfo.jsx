// The Floor's right column: INFO (Roy, 2026-10-23) — "in the future I will put there info about what is going on in the
// app / chat / lists". Since one-axl.md step 5 (2026-11-13; Roy: "instead of a lot of words — wherever we are, show a
// schema") it opens on a DIAGRAM of the flow the user is in, the step they are on lit (infoFlow); the long explanations
// that used to fill it — the Hotlist's columns (2026-10-24), how the trader builds a risk-based trade (2026-11-05) — sit
// under it behind "More". Nothing to place → the column's line saying what it is for.

import PropTypes from 'prop-types'
import { useActivePanel } from '../DetailPanel/detailPanel.store.js'
import { menuDesks } from './FloorLists.jsx'
import { HotlistInfo } from './HotlistInfo.jsx'
import { RiskBasedInfo } from './RiskBasedInfo.jsx'
import { FlowDiagram } from './FlowDiagram.jsx'
import { infoFlow } from './infoFlow.js'

export function FloorInfo({ floor = null, agentState = {}, rows = [] }) {
    // The open LIST owns Info — it covers the chat (Roy, 2026-11-13); nothing open → the chat's flow.
    const active = useActivePanel()
    const list = active ? menuDesks(true).find(d => d.panel === active) ?? null : null
    const flow = infoFlow({ floor, agentState, rows, list })
    const more = list ? (list.key === 'hotlist' ? <HotlistInfo /> : null) : floor === 'mentor' ? <RiskBasedInfo /> : null
    return (
        <aside className="floor-info" aria-label="Info">
            {/* Same .floor-sec heading the Menu uses, so the two side columns open on one line. */}
            <header className="floor-sec">
                <h2 className="floor-sec__title">Info</h2>
            </header>
            {flow || more
                ? (
                    <div className="floor-info__body">
                        <FlowDiagram flow={flow} />
                        {more && (flow
                            ? <details className="floor-info__more"><summary>More</summary>{more}</details>
                            : more)}
                    </div>
                )
                : <p className="floor-empty floor-info__note">What is going on in the app, the chat and your lists will show here.</p>}
        </aside>
    )
}
FloorInfo.propTypes = { floor: PropTypes.string, agentState: PropTypes.object, rows: PropTypes.array }
