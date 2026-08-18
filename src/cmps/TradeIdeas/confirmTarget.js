// WHICH entity the order-confirm dialog is showing — the selection rules, lifted out of MainPage.
//
// This is money-path logic: it decides whose plan gets a Place Orders button. It lived inline in a
// 3000-line component, which meant it could not be tested at all — the only way to exercise "an
// admin must not be offered someone else's idea" was to render the whole page and look. Pure
// functions, so each rule below is one assertion.
//
// Deliberately NOT a hook. There is no React in here: same inputs, same answer, no state and no
// effects. A hook would only make it harder to call from a test.

/**
 * The idea whose plan the confirm dialog should offer, if any.
 *
 * Every clause here is load-bearing and was learned the hard way:
 *
 *  · OWNERSHIP — an admin's list contains every user's ideas (dev visibility), but confirming
 *    places orders through the CURRENT user's broker session. Offering someone else's idea would
 *    place their trade on your accounts. A legacy idea with no `userId` counts as the viewer's.
 *  · WORKSPACE — only the book the user is standing in. Confirming a live idea while looking at
 *    paper is the workspace bug in its most expensive form.
 *  · MANUAL is excluded on purpose: a manual fill is confirmed on the social-chat FillCard, because
 *    the app cannot place the order — the user does, at their bank.
 *  · STATUS, not orderState, is what makes dismiss stick. Once an idea is sent back to `waiting`
 *    the dialog must vanish even if a stale `orderState: 'awaiting_confirm'` was never cleared.
 *  · FIRST RESOLVABLE, not first match. A newer hit whose preview cannot resolve — its broker
 *    account is not in this session, say — must not mask an older hit that has a ready plan.
 *
 * @param {object}   spec
 * @param {object[]} spec.ideas
 * @param {string|null} spec.userId              the viewer
 * @param {string}   spec.workspace              live | paper | manual
 * @param {Set}      spec.dismissedConfirmIds
 * @param {Function} spec.ideaWorkspace          (idea) => workspace
 * @param {Function} spec.ordersForIdea          (idea) => order rows; [] when unresolvable here
 * @returns {{ idea: object|null, orders: object[] }}
 */
export function pickConfirmIdea({ ideas = [], userId = null, workspace, dismissedConfirmIds = new Set(), ideaWorkspace, ordersForIdea }) {
    for (const i of ideas) {
        if (i.userId != null && i.userId !== userId) continue
        const ws = ideaWorkspace(i)
        if (ws !== workspace) continue
        if (ws === 'manual') continue
        if (i.status !== 'hit' || i.ordersPlacedAt || dismissedConfirmIds.has(i.id)) continue
        if (!Array.isArray(i.accounts) || i.accounts.length === 0) continue
        if (i.orderState !== 'awaiting_confirm' && i.orderState != null) continue
        const orders = ordersForIdea(i)
        if (orders.length > 0) return { idea: i, orders }
    }
    return { idea: null, orders: [] }
}

/**
 * The setup whose plan the confirm dialog should offer, if any.
 *
 * Differs from an idea in ONE way that matters: Talos already stamped an executable
 * `pendingOrder.plan` when it flipped the setup to `hit`, so this reads the real plan rather than
 * rebuilding a preview. (Kairos's calls were the third case — a Hermes PROPOSAL that only became
 * orders at confirm time — and went with the desk on 2026-08-18.)
 *
 * `blockedByIdea` keeps one dialog on screen: an idea in flight wins, because it was there first.
 *
 * @returns {{ setup: object|null, orders: object[] }}
 */
export function pickConfirmSetup({ setups = [], setupConfirmId = null, blockedByIdea = false, isAwaitingConfirm }) {
    if (!setupConfirmId || blockedByIdea) return { setup: null, orders: [] }
    const su = setups.find(x => x.id === setupConfirmId)
    if (!su) return { setup: null, orders: [] }
    // Same gate as an idea: still hit, still awaiting confirm, not already placed.
    if (!isAwaitingConfirm(su.status) || su.ordersPlacedAt) return { setup: null, orders: [] }
    if (su.orderState !== 'awaiting_confirm' && su.orderState != null) return { setup: null, orders: [] }
    const orders = Array.isArray(su.pendingOrder?.plan) ? su.pendingOrder.plan : []
    return orders.length ? { setup: su, orders } : { setup: null, orders: [] }
}
