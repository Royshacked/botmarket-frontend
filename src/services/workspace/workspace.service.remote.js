import { httpService } from '../http.service'

const BASE = 'api/workspace'

/**
 * Which of the three books the user is standing in — live, paper or manual.
 *
 * The choice used to live ONLY in localStorage, which was fine while it just scoped a UI list. It
 * stopped being fine once the desks started being told, every turn, which book "my account" means:
 * the server derived the workspace from the paper flag alone, so a user sitting in MANUAL was
 * described to every agent as sitting in LIVE — real money either way, but the app cannot place a
 * single order in manual, and a desk that thinks otherwise will say it placed one.
 *
 * localStorage stays the client's own synchronous source of truth (useWorkspaceMode and the account
 * / position hooks read it without awaiting anything). This service is what tells the SERVER, so
 * both sides answer the question the same way. A failed write is non-fatal: the view still switches
 * and the server falls back to its old paper-or-live derivation.
 */
export const workspaceService = {
    get: getWorkspace,
    set: setWorkspace,
}

/**
 * The server's view: `workspace` is resolved (the paper flag joined with the stored choice),
 * `stored` is the raw choice, null if the user has never made one.
 * @returns {Promise<{workspace:'live'|'paper'|'manual', stored:?string}>}
 */
async function getWorkspace() {
    return httpService.get(BASE)
}

/**
 * Record the user's choice.
 * @param {'live'|'paper'|'manual'} workspace
 * @returns {Promise<{workspace:string, stored:string}>}
 */
async function setWorkspace(workspace) {
    return httpService.put(BASE, { workspace })
}
