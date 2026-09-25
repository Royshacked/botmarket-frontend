// ONE pop-out mechanism for every entity: the opener, the hand-off, and the route.
//
// Clicking any card opens that entity's detail window. That was already true for ideas and calls,
// but each had its own opener — same three steps (stash → window.open → inject), differing only in
// route, window size and the property name they injected under. ChatWindow had grown a THIRD,
// thinner copy that skipped the stash entirely, so a call opened from social chat had to round-trip
// the API while the same call opened from the Calls tab painted instantly.
//
// Setups had no opener at all: clicking one switched the chat tab instead of opening anything,
// because writing a fourth copy was the price of giving them a window.
//
// Registering a kind here is now the whole cost of that.
//
// ── TWO SURFACES, ONE DOORWAY (2026-09-25) ───────────────────────────────────
// A pop-out window is a desktop answer. On a phone `window.open` ignores the size arguments and
// yields a TAB — and inside an installed PWA that tab can land outside the app altogether. Three
// things break with it: the tab has no `window.opener`, so the "re-draw it in Mentor" hand-off
// renders as a memo instead of a button; `window.close()` after a delete is a no-op on a tab the
// script did not open, leaving the user staring at a deleted setup; and the service worker's
// presence check (pwa/rules isPopoutPath) stops counting that window as the app, so a push fires
// while the user is looking at the screen and a tap opens a SECOND instance.
//
// So a handheld opens the same page IN PLACE instead, over the still-mounted workspace, on a query
// param rather than the pop-out path — which is why none of the above applies: the app window is
// still the app window. The choice is made here, at the one opener, so every call site (the Floor,
// the lists, the social-chat bubbles, Axl's `<show>`) gets the right surface without knowing there
// are two.

// The extension is spelled out, unlike most imports in src/: this module is reached from the
// node:test half of the suite (tradeIdea.utils → here), and node resolves no extensions of its own.
import { eventBus, ENTITY_DETAIL_OPEN } from '../../services/event-bus.service.js'
import { INLINE_KINDS } from './entityDetail.js'

/**
 * Per-kind pop-out wiring. `width`/`height` are the window size the kind's detail view needs — a
 * call's page carries a chart and an assessment journal, an idea's is narrower.
 */
export const POPUP_KINDS = {
    idea:  { route: 'idea',  width: 960,  height: 720 },
    call:  { route: 'call',  width: 1180, height: 760 },
    setup: { route: 'setup', width: 1180, height: 760 },
}

/** Where the opener parks the entity for the new window to pick up. */
export const stashKey = (kind, id) => `popup-${kind}-${id}`

// The phone test, and deliberately not a width one alone. A coarse pointer is the device saying it
// is a touch screen whatever its width, and `max-width` is the app's own mobile breakpoint (the one
// RootCmp.scss collapses the workspace on). Either is enough: a tablet in portrait wants the page
// as much as a phone does, and a narrow desktop window can still open a real window.
//
// jsdom and old browsers have no matchMedia — falling back to "not handheld" keeps the desktop
// behaviour, which is the one that has always worked.
export function isHandheld(win = typeof window === 'undefined' ? null : window) {
    const mm = win?.matchMedia
    if (typeof mm !== 'function') return false
    try { return !!(mm.call(win, '(pointer: coarse)').matches || mm.call(win, '(max-width: 767px)').matches) }
    catch { return false }
}

/**
 * Open an entity's pop-out detail window.
 *
 * The entity is handed over TWICE on purpose, because neither path is reliable alone:
 *   • `window.__entityData` — instant, but lost if the popup is slow to boot or was blocked.
 *   • localStorage — survives that, but a popup opened from a different origin/session won't see it.
 * The receiving page falls back to the API when neither lands, so a pasted URL still works.
 *
 * On a handheld this opens the page IN PLACE instead and returns null — see the surfaces note at
 * the top. The stash is written either way, so the in-app page paints from it exactly as the window
 * would; only the `window.__entityData` tier is a window's own.
 *
 * @param {string} kind          a key of POPUP_KINDS
 * @param {Object|string} entity the full entity (stashed for an instant first paint) or a bare id
 * @returns {Window|null}
 */
export function openEntityPopup(kind, entity) {
    const cfg = POPUP_KINDS[kind]
    if (!cfg) {
        console.error(`[entityPopup] unknown kind "${kind}"`)
        return null
    }
    const isObj = entity && typeof entity === 'object'
    const id    = isObj ? entity.id : entity
    if (!id) return null

    if (isObj) {
        try { localStorage.setItem(stashKey(kind, id), JSON.stringify(entity)) }
        catch { /* quota / private mode — the popup falls back to the API */ }
    }

    // A handheld with an in-app page for this kind takes it. A kind without one (a `call`) still
    // opens a window even on a phone: a tab is a poor surface, and no surface is worse.
    if (isHandheld() && INLINE_KINDS.includes(kind)) {
        eventBus.emit(ENTITY_DETAIL_OPEN, { kind, id })
        return null
    }

    const popup = window.open(
        `/${cfg.route}/${id}`,
        `${cfg.route}-${id}`,
        `width=${cfg.width},height=${cfg.height}`,
    )
    if (popup && isObj) popup.__entityData = { kind, entity }
    return popup
}

/** The id in `/idea/abc123`. The pop-out reads its own URL — there is no router param here. */
export const popupIdFromPath = () => window.location.pathname.split('/').at(-1)
