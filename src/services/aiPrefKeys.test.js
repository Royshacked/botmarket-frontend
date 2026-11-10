import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AI_MODEL_KEY, AI_PREF_KEYS, LEGACY_AI_PREF_KEYS, MONITOR_REASONING_KEY, migrateAiPrefs } from './aiPrefKeys.js'

// A minimal localStorage: getItem must return null (not undefined) for a missing key, which is
// what the migration's `!= null` checks are written against.
function fakeStorage(initial = {}) {
    const map = new Map(Object.entries(initial))
    return {
        getItem:    k => (map.has(k) ? map.get(k) : null),
        setItem:    (k, v) => map.set(k, String(v)),
        removeItem: k => map.delete(k),
        snapshot:   () => Object.fromEntries(map),
    }
}

test('the model is the only AI setting left', () => {
    assert.deepEqual(AI_PREF_KEYS, [AI_MODEL_KEY])
})

test('nothing user-facing writes a reasoning or routing key any more', () => {
    // The removed knobs, and the per-desk shape before them. All of it is migration input now —
    // if any of these came back as a live key, a request parameter could change mid-conversation
    // again and take the prompt cache with it.
    for (const gone of ['aiReasoning', 'aiRoutingMode', 'axlRoutingMode', 'mentorReasoning']) {
        assert.ok(!AI_PREF_KEYS.includes(gone), `${gone} is still a live key`)
        assert.ok(LEGACY_AI_PREF_KEYS.includes(gone), `${gone} is not cleaned up`)
    }
})

// ── migration ─────────────────────────────────────────────────────────────────

test('an existing model choice survives, from either old shape', () => {
    for (const legacy of ['ideaModel', 'axlModel', 'analystModel']) {
        const storage = fakeStorage({ [legacy]: 'claude-opus-5' })
        const { adopted } = migrateAiPrefs(storage)
        assert.equal(storage.getItem(AI_MODEL_KEY), 'claude-opus-5', legacy)
        assert.deepEqual(adopted, [AI_MODEL_KEY])
    }
})

test('reasoning and routing values are dropped, not migrated', () => {
    // There is nowhere for them to go — the knobs they drove no longer exist.
    const storage = fakeStorage({ aiRoutingMode: 'classifier', aiReasoning: 'high', mentorReasoning: 'low' })
    const { adopted } = migrateAiPrefs(storage)

    assert.deepEqual(adopted, [])
    assert.deepEqual(storage.snapshot(), {})
})

test('every legacy key is cleared', () => {
    const storage = fakeStorage(Object.fromEntries(LEGACY_AI_PREF_KEYS.map(k => [k, 'x'])))
    const { cleared } = migrateAiPrefs(storage)

    assert.deepEqual(cleared.sort(), [...LEGACY_AI_PREF_KEYS].sort())
    for (const key of LEGACY_AI_PREF_KEYS) assert.equal(storage.getItem(key), null)
})

test('no kairos key is a migration input any more', () => {
    assert.ok(!LEGACY_AI_PREF_KEYS.some(k => k.startsWith('kairos')))
})

test('a fresh user is left alone — the default is not frozen into their account', () => {
    const storage = fakeStorage()
    const { adopted, cleared } = migrateAiPrefs(storage)

    assert.deepEqual(adopted, [])
    assert.deepEqual(cleared, [])
    assert.deepEqual(storage.snapshot(), {})
})

test('a model already on the new key wins over any leftover', () => {
    const storage = fakeStorage({ [AI_MODEL_KEY]: 'claude-sonnet-4-6', ideaModel: 'claude-opus-5' })
    const { adopted } = migrateAiPrefs(storage)

    assert.equal(storage.getItem(AI_MODEL_KEY), 'claude-sonnet-4-6')
    assert.deepEqual(adopted, [])
})

test('it is idempotent — a second run is a no-op', () => {
    const storage = fakeStorage({ mentorModel: 'claude-opus-5', axlRoutingMode: 'auto' })
    migrateAiPrefs(storage)
    const after = storage.snapshot()

    const { adopted, cleared } = migrateAiPrefs(storage)
    assert.deepEqual(adopted, [])
    assert.deepEqual(cleared, [])
    assert.deepEqual(storage.snapshot(), after)
})

test('the monitors\' reasoning moves from hermesReasoning to talosReasoning; the other hermes keys go', () => {
    const storage = fakeStorage({
        hermesModel: 'claude-opus-5', hermesReasoning: 'high', hermesRoutingMode: 'auto',
        ideaModel: 'claude-sonnet-4-6',
    })
    const { adopted, cleared } = migrateAiPrefs(storage)

    assert.equal(MONITOR_REASONING_KEY, 'talosReasoning')
    assert.equal(storage.getItem('talosReasoning'), 'high')
    assert.ok(adopted.includes('talosReasoning'))   // adopted → hydratePreferences queues a sync
    for (const gone of ['hermesModel', 'hermesReasoning', 'hermesRoutingMode']) {
        assert.equal(storage.getItem(gone), null, gone)
        assert.ok(cleared.includes(gone), gone)
    }
    assert.equal(storage.getItem(AI_MODEL_KEY), 'claude-sonnet-4-6')
})

test('a talosReasoning already set wins over a leftover hermesReasoning', () => {
    const storage = fakeStorage({ talosReasoning: 'off', hermesReasoning: 'high' })
    const { adopted } = migrateAiPrefs(storage)

    assert.equal(storage.getItem('talosReasoning'), 'off')
    assert.equal(storage.getItem('hermesReasoning'), null)
    assert.deepEqual(adopted, [])
})
