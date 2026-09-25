// The in-app detail surface's URL. Pure functions, so node:test.
//   node --test src/cmps/EntityCard/entityDetail.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { detailFromSearch, withDetail, withoutDetail } from './entityDetail.js'

test('a detail param IS the open page', () => {
    assert.deepEqual(detailFromSearch('?setup=s1'), { kind: 'setup', id: 's1' })
    assert.deepEqual(detailFromSearch('?idea=i1'), { kind: 'idea', id: 'i1' })
})

test('nothing open reads as nothing — including the shapes a URL actually arrives in', () => {
    assert.equal(detailFromSearch(''), null)
    assert.equal(detailFromSearch('?chat=c1&msg=m1'), null, 'a push landing is not a detail page')
    assert.equal(detailFromSearch(null), null)
    assert.equal(detailFromSearch(undefined), null)
    assert.equal(detailFromSearch('?setup='), null, 'an empty id opens nothing, not an empty page')
})

test('a kind with no page in the app is not openable by URL', () => {
    // `call` is archived: RootCmp renders no page for it, so the param must not read as open.
    assert.equal(detailFromSearch('?call=c1'), null)
    assert.equal(detailFromSearch('?coverage=cov1'), null)
})

test('two named at once → the first, not a race between two full-screen pages', () => {
    assert.deepEqual(detailFromSearch('?setup=s1&idea=i1'), { kind: 'idea', id: 'i1' })
})

// Everything else on the URL is someone else's — a push lands on `?chat=&msg=`, and closing a setup
// must not also close the conversation it was opened from.
test('opening and closing preserve the rest of the query', () => {
    assert.equal(withDetail('?chat=c1', 'setup', 's1'), '?chat=c1&setup=s1')
    assert.equal(withoutDetail('?chat=c1&setup=s1'), '?chat=c1')
    assert.equal(withoutDetail('?setup=s1'), '', 'the last param leaves no dangling ?')
})

test('opening a second item replaces the first — one page at a time', () => {
    assert.equal(withDetail('?setup=s1', 'setup', 's2'), '?setup=s2')
    assert.equal(withDetail('?setup=s1', 'idea', 'i1'), '?idea=i1')
})

test('an id with URL-hostile characters survives the round trip', () => {
    const id = 'a b&c=d'
    assert.deepEqual(detailFromSearch(withDetail('', 'setup', id)), { kind: 'setup', id })
})
