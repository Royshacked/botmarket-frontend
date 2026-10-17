import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { openSurface, closeSurface, closePane, showSurface, setPinned, sidePaneState, _resetSidePane } from './sidePane.store.js'

// The side pane's tabs (unified-chat plan phase 8b): one per desk opened, following the floor unless pinned.

beforeEach(() => _resetSidePane())

test('opening a desk adds its tab and shows it; opening it again only shows it', () => {
    openSurface('mentor')
    openSurface('portfolio')
    assert.deepEqual(sidePaneState(), { tabs: ['mentor', 'portfolio'], active: 'portfolio', pinned: false })
    openSurface('mentor')
    assert.deepEqual(sidePaneState().tabs, ['mentor', 'portfolio'])
    assert.equal(sidePaneState().active, 'mentor')
})

test('the floor moving does not take over a pinned tab — it adds its own beside it', () => {
    openSurface('mentor')
    setPinned(true)
    openSurface('portfolio', { follow: true })
    assert.deepEqual(sidePaneState(), { tabs: ['mentor', 'portfolio'], active: 'mentor', pinned: true })
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
    assert.deepEqual(sidePaneState(), { tabs: ['mentor', 'scanner'], active: 'mentor', pinned: false })
    closeSurface('scanner')
    closeSurface('mentor')
    assert.deepEqual(sidePaneState(), { tabs: [], active: null, pinned: false })
    closeSurface('nope')
    assert.equal(sidePaneState().active, null)
})

test('closePane drops every tab; a pin needs a tab to pin', () => {
    setPinned(true)
    assert.equal(sidePaneState().pinned, false)
    openSurface('mentor'); openSurface('portfolio')
    closePane()
    assert.deepEqual(sidePaneState(), { tabs: [], active: null, pinned: false })
    openSurface(null)
    assert.deepEqual(sidePaneState().tabs, [])
})
