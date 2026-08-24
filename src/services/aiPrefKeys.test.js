import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AI_MODEL_KEY, AI_PREF_KEYS, LEGACY_AI_PREF_KEYS, migrateAiPrefs } from './aiPrefKeys.js'

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
    const storage = fakeStorage({ aiRoutingMode: 'classifier', aiReasoning: 'high', kairosReasoning: 'low' })
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

test('the monitors keep their own model and reasoning', () => {
    // hermesModel/hermesReasoning drive Hermes and Talos and are read server-side. Only
    // hermesRoutingMode goes — it never had a reader.
    const storage = fakeStorage({
        hermesModel: 'claude-opus-5', hermesReasoning: 'high', hermesRoutingMode: 'auto',
        ideaModel: 'claude-sonnet-4-6',
    })
    migrateAiPrefs(storage)

    assert.equal(storage.getItem('hermesModel'), 'claude-opus-5')
    assert.equal(storage.getItem('hermesReasoning'), 'high')
    assert.equal(storage.getItem('hermesRoutingMode'), null)
    assert.equal(storage.getItem(AI_MODEL_KEY), 'claude-sonnet-4-6')
})
