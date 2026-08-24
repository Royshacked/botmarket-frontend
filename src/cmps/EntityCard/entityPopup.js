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

/**
 * Open an entity's pop-out detail window.
 *
 * The entity is handed over TWICE on purpose, because neither path is reliable alone:
 *   • `window.__entityData` — instant, but lost if the popup is slow to boot or was blocked.
 *   • localStorage — survives that, but a popup opened from a different origin/session won't see it.
 * The receiving page falls back to the API when neither lands, so a pasted URL still works.
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
