import test from 'node:test'
import assert from 'node:assert/strict'

import { pickConfirmIdea, pickConfirmSetup } from './confirmTarget.js'

// The rules deciding whose plan gets a Place Orders button. They lived inline in MainPage and were
// therefore untestable; each clause below was load-bearing in production and is now one assertion.
// The ownership one in particular: an admin's list contains every user's ideas, and confirming
// places orders through the CURRENT user's broker session.

const ideaWorkspace = (i) => i.mode ?? 'live'
const ordersForIdea = (i) => (i.plan ?? [])
const isAwaitingConfirm = (s) => s === 'hit'

const idea = (over = {}) => ({
    id: 'i1', userId: 'u1', mode: 'live', status: 'hit', accounts: ['a1'],
    orderState: 'awaiting_confirm', plan: [{ accountId: 'a1' }], ...over,
})
const pick = (over = {}) => pickConfirmIdea({
    ideas: [idea()], userId: 'u1', workspace: 'live',
    dismissedConfirmIds: new Set(), ideaWorkspace, ordersForIdea, ...over,
})

test('offers a hit idea with a resolvable plan', () => {
    assert.equal(pick().idea.id, 'i1')
    assert.equal(pick().orders.length, 1)
})

test('NEVER offers another user’s idea — it would place their trade on your accounts', () => {
    assert.equal(pick({ ideas: [idea({ userId: 'someone-else' })] }).idea, null)
})

test('a legacy ownerless idea counts as the viewer’s own', () => {
    assert.equal(pick({ ideas: [idea({ userId: null })] }).idea.id, 'i1')
})

test('only the workspace the user is standing in', () => {
    // Confirming a LIVE idea while looking at paper is the workspace bug at its most expensive.
    assert.equal(pick({ ideas: [idea({ mode: 'paper' })], workspace: 'live' }).idea, null)
    assert.equal(pick({ ideas: [idea({ mode: 'paper' })], workspace: 'paper' }).idea.id, 'i1')
})

test('manual is excluded even when it IS the active workspace', () => {
    // A manual fill is confirmed on the social-chat FillCard — the app cannot place that order.
    assert.equal(pick({ ideas: [idea({ mode: 'manual' })], workspace: 'manual' }).idea, null)
})

test('dismiss sticks, and so does being sent back to waiting', () => {
    assert.equal(pick({ dismissedConfirmIds: new Set(['i1']) }).idea, null)
    // Keyed on STATUS, not orderState: a stale 'awaiting_confirm' must not resurrect the dialog.
    assert.equal(pick({ ideas: [idea({ status: 'waiting' })] }).idea, null)
})

test('an already-placed idea is never re-offered', () => {
    assert.equal(pick({ ideas: [idea({ ordersPlacedAt: 123 })] }).idea, null)
})

test('an idea parked for the market open stays deferred', () => {
    assert.equal(pick({ ideas: [idea({ orderState: 'awaiting_market' })] }).idea, null)
})

test('an idea with no marked accounts cannot be placed, so it is not offered', () => {
    assert.equal(pick({ ideas: [idea({ accounts: [] })] }).idea, null)
})

test('an UNRESOLVABLE newer hit does not mask an older one that is ready', () => {
    // The bug this clause exists for: the newer idea's broker account is not in this session, so
    // its preview comes back empty. Returning it would show an empty dialog and hide a real plan.
    const stuck = idea({ id: 'new', plan: [] })
    const ready = idea({ id: 'old' })
    assert.equal(pickConfirmIdea({
        ideas: [stuck, ready], userId: 'u1', workspace: 'live',
        dismissedConfirmIds: new Set(), ideaWorkspace, ordersForIdea,
    }).idea.id, 'old')
})

// ── setups ────────────────────────────────────────────────────────────────────

const setup = (over = {}) => ({
    id: 's1', status: 'hit', orderState: 'awaiting_confirm',
    pendingOrder: { plan: [{ accountId: 'a1' }] }, ...over,
})
const pickS = (over = {}) => pickConfirmSetup({
    setups: [setup()], setupConfirmId: 's1', isAwaitingConfirm, ...over,
})

test('a setup reads Talos’s stamped plan rather than rebuilding a preview', () => {
    assert.equal(pickS().setup.id, 's1')
    assert.deepEqual(pickS().orders, [{ accountId: 'a1' }])
})

test('an idea in flight WINS — one dialog on screen, and it was there first', () => {
    assert.equal(pickS({ blockedByIdea: true }).setup, null)
})

test('nothing is offered without an explicit setupConfirmId', () => {
    // Unlike ideas, a setup dialog is opened by a card the user tapped — never volunteered.
    assert.equal(pickS({ setupConfirmId: null }).setup, null)
})

test('the same gates apply: placed, wrong status, or parked', () => {
    assert.equal(pickS({ setups: [setup({ ordersPlacedAt: 1 })] }).setup, null)
    assert.equal(pickS({ setups: [setup({ status: 'waiting' })] }).setup, null)
    assert.equal(pickS({ setups: [setup({ orderState: 'awaiting_market' })] }).setup, null)
})

test('a setup with an empty plan is not offered — an empty dialog helps nobody', () => {
    assert.equal(pickS({ setups: [setup({ pendingOrder: { plan: [] } })] }).setup, null)
    assert.equal(pickS({ setups: [setup({ pendingOrder: null })] }).setup, null)
})

test('an id that matches no setup resolves to nothing rather than throwing', () => {
    assert.equal(pickS({ setupConfirmId: 'gone' }).setup, null)
})
