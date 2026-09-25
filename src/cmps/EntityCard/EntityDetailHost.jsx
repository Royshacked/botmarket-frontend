import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'

import { eventBus, ENTITY_DETAIL_OPEN } from '../../services/event-bus.service'
import { detailFromSearch, withDetail, withoutDetail } from './entityDetail.js'
import { SetupPage } from '../../pages/SetupPage.jsx'
import { IdeaPage } from '../../pages/IdeaPage.jsx'
import './EntityDetailHost.scss'

// ── The detail surface, IN the app ───────────────────────────────────────────
//
// The other half of entityPopup's two surfaces. On a desktop a card opens a pop-out WINDOW; on a
// handheld there is no such thing — `window.open` yields a tab that can leave an installed app
// behind — so the same page opens here instead, full-screen over the workspace that is still
// mounted underneath.
//
// IT IS A ROUTE, NOT A SHEET. Three things follow from that and none of them is decoration:
//   • the phone's own back button and edge-swipe close it, because it is a history entry;
//   • the workspace underneath keeps its state — this renders BESIDE MainPage, which stays mounted
//     exactly as it does for a profile visit, so a chat mid-stream is still there on the way back;
//   • a link into it survives a reload, since the id is in the URL.
//
// WHY A QUERY PARAM AND NOT `/setup/:id`. That path is the POP-OUT's, and the service worker uses
// it to decide what counts as "the app" (pwa/rules isPopoutPath): a window sitting on it is a
// pop-out, which has no chat to open a card in and whose being focused says nothing about whether
// the user saw one. Navigating the app's only window there on a phone would tell the worker the app
// is not open — so a push would fire while the user is reading the very setup it is about, and a
// tap would open a second instance beside this one. On `?setup=<id>` the pathname never changes,
// the window is still the app, and none of that machinery has to learn a second rule.
//
// A sheet was the other candidate and is the wrong shape here: there is nothing behind it to stay
// in context with (the lists column is display:none under 767px), the content is a chart plus a
// nested-scrolling journal, and a sheet earns no history entry — so the back gesture would leave
// the app instead of closing the page.

// The page per kind. A kind with no entry here simply cannot be shown in the app — which is what
// keeps `?call=…` from rendering an empty frame now that the call page is archived.
const PAGES = { setup: SetupPage, idea: IdeaPage }

export function EntityDetailHost() {
    const location = useLocation()
    const navigate = useNavigate()
    // Did WE push the history entry we are standing on? Only then is closing a step BACK; a page
    // reached by a pasted link or a reload has nothing behind it, and navigate(-1) there would take
    // the user out of the app entirely.
    const pushedRef = useRef(false)

    const detail = detailFromSearch(location.search)
    const openKey = detail ? `${detail.kind}:${detail.id}` : null

    // Registered once — so it reads the LIVE url rather than the one this closure was born with.
    useEffect(() => eventBus.on(ENTITY_DETAIL_OPEN, ({ kind, id } = {}) => {
        if (!PAGES[kind] || !id) return
        pushedRef.current = true
        navigate(`${window.location.pathname}${withDetail(window.location.search, kind, id)}`)
    }), [navigate])

    // Closed by the browser's own back, not by the button: the entry we pushed is gone, so the next
    // close must not try to step back over it again.
    useEffect(() => { if (!openKey) pushedRef.current = false }, [openKey])

    if (!detail) return null
    const Page = PAGES[detail.kind]

    function close() {
        if (pushedRef.current) { pushedRef.current = false; navigate(-1); return }
        navigate(`${window.location.pathname}${withoutDetail(window.location.search)}`, { replace: true })
    }

    return (
        <div className="entity-detail" role="dialog" aria-modal="true">
            {/* Keyed on the entity: opening a second setup from inside the first must start the
                page over — the journal, the positions and the poll all belong to one document. */}
            <Page key={openKey} entityId={detail.id} onClose={close} />
        </div>
    )
}
