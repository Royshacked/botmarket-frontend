// ── The shared AI setting ─────────────────────────────────────────────────────
// ONE key: the model every conversational desk runs on. That is the whole design.
//
// Two things used to live here and are deliberately gone.
//
// PER-DESK KEYS. Each desk had its own `<agent>Model` / `<agent>Reasoning` /
// `<agent>RoutingMode` triple — a real feature once, when every panel had its own header
// selector and you could run two desks on different models side by side. That UI went away; the
// profile's single card replaced it and mirrored one value across every per-desk key, coordinated
// by a hand-maintained list of desk names. Four desks (axl, mentor, analyst, strategy) were never
// on that list, so they read keys nothing wrote and silently ran on the defaults. A missing key
// reads exactly like an unset one, so nothing ever surfaced it.
//
// ROUTING MODE AND REASONING. `manual` / `auto` (phase tables) / `classifier` (a Haiku call that
// picked a model per turn), plus a per-turn reasoning-effort selector. Both changed a REQUEST
// PARAMETER mid-conversation, and both a model change and a reasoning change invalidate the
// prompt cache — the conversation is then re-read at 1x and re-written at 1.25x instead of read
// at 0.1x. Choosing a cheaper model or a lighter effort for one turn never repaid that, and the
// penalty scales with conversation length while the saving does not. Reasoning still exists as an
// internal parameter (the monitors set it, and the provider floors Opus 5 to 'low' because it
// reasons whether or not asked) — it is just not a user-facing knob any more.
export const AI_MODEL_KEY = 'aiModel'

export const AI_PREF_KEYS = [AI_MODEL_KEY]

// ── Migration off the old shape ───────────────────────────────────────────────
// Everything the two removed features ever wrote.
const LEGACY_AGENTS = ['idea', 'scanner', 'portfolio', 'axl', 'mentor', 'analyst', 'strategy']
const LEGACY_SUFFIXES = ['Model', 'Reasoning', 'RoutingMode']

export const LEGACY_AI_PREF_KEYS = [
    // the short-lived one-key-per-field shape
    'aiReasoning', 'aiRoutingMode',
    // the per-desk shape before it
    ...LEGACY_AGENTS.flatMap(agent => LEGACY_SUFFIXES.map(suffix => `${agent}${suffix}`)),
    // The monitors' old `hermes*` keys (2026-11-10). `hermesReasoning` is CARRIED to
    // MONITOR_REASONING_KEY below before it is cleared; the model and routing mode had no reader.
    'hermesModel', 'hermesReasoning', 'hermesRoutingMode',
]

// The monitors' own knob: how hard Talos thinks, read SERVER-SIDE (backend monitoring/assess.shared.js,
// capped at `low` there). Not part of the desk setting and no profile card writes it. It was
// `hermesReasoning` until Hermes was deleted with Kairos; the server's migration renamed the stored
// copy, and migrateAiPrefs renames a browser's.
export const MONITOR_REASONING_KEY = 'talosReasoning'
const LEGACY_MONITOR_REASONING_KEY = 'hermesReasoning'

/**
 * Adopt the user's existing MODEL choice into the single key, then clear everything the old
 * shapes left behind. Desk reasoning and routing-mode values are dropped, not migrated: there is
 * nowhere for them to go. The one exception is the monitors' `hermesReasoning`, which moves to
 * MONITOR_REASONING_KEY.
 *
 * Any populated model key is the choice — the profile wrote one value to all of them — so the
 * first one found wins. A user with nothing stored is left alone: they are on the default, and
 * writing today's default into their account would pin them against a future change of default.
 *
 * @param {Storage} storage  localStorage, or any getItem/setItem/removeItem trio (tests stub it)
 * @returns {{adopted: string[], cleared: string[]}} what it wrote and what it removed
 */
export function migrateAiPrefs(storage) {
    const adopted = []
    const cleared = []

    // Never overwrite a value already on the new key — a second run, or a user who has since
    // picked a model fresh, must not be reverted to whatever an old key still holds.
    if (storage.getItem(AI_MODEL_KEY) == null) {
        const inherited = LEGACY_AGENTS
            .map(agent => storage.getItem(`${agent}Model`))
            .find(value => value != null)
        if (inherited != null) {
            storage.setItem(AI_MODEL_KEY, inherited)
            adopted.push(AI_MODEL_KEY)
        }
    }

    // The monitors' reasoning moves to its new name, again never over a value already there.
    const oldReasoning = storage.getItem(LEGACY_MONITOR_REASONING_KEY)
    if (oldReasoning != null && storage.getItem(MONITOR_REASONING_KEY) == null) {
        storage.setItem(MONITOR_REASONING_KEY, oldReasoning)
        adopted.push(MONITOR_REASONING_KEY)
    }

    // Clear unconditionally, not just on adopt: a leftover key is a stale value waiting for the
    // next reader written against the old shape.
    for (const key of LEGACY_AI_PREF_KEYS) {
        if (storage.getItem(key) == null) continue
        storage.removeItem(key)
        cleared.push(key)
    }

    return { adopted, cleared }
}
