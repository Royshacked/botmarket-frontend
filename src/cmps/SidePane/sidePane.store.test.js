import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { openSurface, closeSurface, closePane, showSurface, setPinned, sidePaneState, reopenPane, _resetSidePane } from './sidePane.store.js'

// The side pane's tabs (unified-chat plan phase 8b): one per desk opened, following the floor unless pinned.

beforeEach(() => _resetSidePane())

test('opening a desk adds its tab and shows it; opening it again only shows it', () => {
    openSurface('mentor')
    openSurface('portfolio')
    assert.deepEqual(sidePaneState(), { tabs: ['mentor', 'portfolio'], active: 'portfolio', pinned: false, parked: [], hidden: null, collapsed: false })
    openSurface('mentor')
    assert.deepEqual(sidePaneState().tabs, ['mentor', 'portfolio'])
    assert.equal(sidePaneState().active, 'mentor')
})

test('the floor moving does not take over a pinned tab — it adds its own beside it', () => {
    openSurface('mentor')
    setPinned(true)
    openSurface('portfolio', { follow: true })
    assert.deepEqual(sidePaneState(), { tabs: ['mentor', 'portfolio'], active: 'mentor', pinned: true, parked: [], hidden: null, collapsed: false })
    openSurface('portfolio')
    assert.equal(sidePaneState().active, 'portfolio', 'the user\'s own open still switches')
    setPinned(false)
    openSurface('scanner', { follow: true })
    assert.equal(sidePaneState().active, 'scanner')
})

test('closing a tab shows the one before it; the last one closes the pane and its pin', () => {
    openSurface('mentor'); openSurface('portfolio'); openSurface('scanner')
    showSurface('portfolio')
    setPinned(true)
    closeSurface('portfolio')
    assert.deepEqual(sidePaneState(), { tabs: ['mentor', 'scanner'], active: 'mentor', pinned: false, parked: [], hidden: null, collapsed: false })
    closeSurface('scanner')
    closeSurface('mentor')
    assert.deepEqual(sidePaneState(), { tabs: [], active: null, pinned: false, parked: [], hidden: null, collapsed: false })
    closeSurface('nope')
    assert.equal(sidePaneState().active, null)
})

test('closePane drops every tab — PARKED, so a kept surface stays mounted; closing its own tab ends it (8e)', () => {
    setPinned(true)
    assert.equal(sidePaneState().pinned, false)
    openSurface('mentor'); openSurface('strategy')
    closePane()
    assert.deepEqual(sidePaneState(), { tabs: [], active: null, pinned: false, parked: ['mentor', 'strategy'], hidden: { tabs: ['mentor', 'strategy'], active: 'strategy' }, collapsed: false })
    openSurface('strategy')
    closeSurface('strategy')
    assert.deepEqual(sidePaneState().parked, ['mentor'], 'its own tab closed — no longer parked')
    openSurface(null)
    assert.deepEqual(sidePaneState().tabs, [])
})

test('reopenPane brings back what the pane was CLOSED over — tabs and the one showing — once', () => {
    openSurface('mentor'); openSurface('portfolio'); showSurface('mentor')
    closePane()
    reopenPane('scanner')
    assert.deepEqual(sidePaneState(), { tabs: ['mentor', 'portfolio'], active: 'mentor', pinned: false, parked: ['mentor', 'portfolio'], hidden: null, collapsed: false })
    reopenPane('scanner')
    assert.deepEqual(sidePaneState().tabs, ['mentor', 'portfolio'], 'open → a no-op')
})

test('reopenPane with nothing remembered opens the fallback (the floor\'s desk); a closed TAB is not remembered', () => {
    reopenPane('mentor')
    assert.deepEqual([sidePaneState().tabs, sidePaneState().active], [['mentor'], 'mentor'])
    closeSurface('mentor')
    assert.equal(sidePaneState().hidden, null)
    reopenPane(null)
    assert.deepEqual(sidePaneState().tabs, [], 'no fallback → nothing opens')
})

test('any open forgets what was hidden — the toggle never resurrects an old set over new work', () => {
    openSurface('mentor'); closePane()
    openSurface('scanner', { follow: true })
    assert.equal(sidePaneState().hidden, null)
})

// A phone (Roy, 2026-10-28): the floor moving opens a desk with its sheet DOWN; the user raises and lowers it.
test('a phone: following the floor opens the desk collapsed; raise, lower; a doorway raises it', async () => {
    const { collapsePane, expandPane } = await import('./sidePane.store.js')
    _resetSidePane()
    openSurface('mentor', { follow: true, collapse: true })
    assert.deepEqual([sidePaneState().tabs, sidePaneState().collapsed], [['mentor'], true])
    expandPane()
    assert.equal(sidePaneState().collapsed, false)
    openSurface('scanner', { follow: true, collapse: true })
    assert.deepEqual([sidePaneState().active, sidePaneState().collapsed], ['scanner', false], 'the sheet up stays up as the floor moves')
    collapsePane()
    assert.deepEqual([sidePaneState().tabs, sidePaneState().collapsed], [['mentor', 'scanner'], true], 'lowered, not closed')
    openSurface('portfolio')
    assert.equal(sidePaneState().collapsed, false, 'a doorway is the user asking for the desk')
    closePane()
    assert.equal(sidePaneState().collapsed, false)
    openSurface('mentor', { follow: true })
    assert.equal(sidePaneState().collapsed, false, 'a desktop never collapses')
})
