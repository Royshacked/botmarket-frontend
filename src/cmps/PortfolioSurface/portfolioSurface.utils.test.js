import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    bookIdeas, buildSummary, planStatus, accountsMoved, bookPending, avoidQuestion, sleeveLine, pressReport,
    refusalText, describeChange,
} from './portfolioSurface.utils.js'

// The rules Atlas's surface draws by (phase 8c) — moved from PortfolioPanel and MainPage with their reasons.

const BOOK = [
    { id: 'i1', asset: 'MSFT', quantity: 10, portfolioId: 'p1', portfolioName: 'Quality', status: 'waiting', accounts: ['a1'], mainAccountId: 'a1' },
    { id: 'i2', asset: 'KO',   quantity: 20, portfolioId: 'p1', portfolioName: 'Quality', status: 'long',    accounts: ['a1'], mainAccountId: 'a1' },
    { id: 'x9', asset: 'TSLA', quantity: 1,  portfolioId: 'p2' },
]

test('a book is the ideas carrying its id; no book, no holdings', () => {
    assert.deepEqual(bookIdeas(BOOK, 'p1').map(i => i.id), ['i1', 'i2'])
    assert.deepEqual(bookIdeas(BOOK, null), [])
    assert.deepEqual(bookIdeas(null, 'p1'), [])
})

test('the summary lists the plan on the table, else the book as it stands', () => {
    assert.deepEqual(buildSummary({ name: 'Growth', ideas: [{ asset: 'NVDA', quantity: 5 }, { asset: 'AMD' }] }, bookIdeas(BOOK, 'p1')),
        { name: 'Growth', items: [{ asset: 'NVDA', quantity: 5 }, { asset: 'AMD', quantity: null }] })
    assert.deepEqual(buildSummary(null, bookIdeas(BOOK, 'p1')),
        { name: 'Quality', items: [{ asset: 'MSFT', quantity: 10 }, { asset: 'KO', quantity: 20 }] })
    assert.deepEqual(buildSummary(null, []), { name: null, items: [] })
})

test('a plan saves only when every holding has a share count; no size and no prices are told apart', () => {
    assert.deepEqual(planStatus({ positionSize: 10000, ideas: [{ quantity: 3 }, { quantity: 1 }] }), { ready: true, hasSize: true })
    assert.deepEqual(planStatus({ ideas: [{ quantity: 3 }, { quantity: 0 }] }), { ready: false, hasSize: false })
    assert.deepEqual(planStatus({ positionSize: 5000, ideas: [{}] }), { ready: false, hasSize: true })
    assert.deepEqual(planStatus({ ideas: [] }), { ready: false, hasSize: false })
    assert.deepEqual(planStatus(null), { ready: false, hasSize: false })
})

test('an edit with no plan has something to save only when the marked accounts moved on a re-pointable leg', () => {
    const book = bookIdeas(BOOK, 'p1')
    assert.equal(accountsMoved(book, ['a1'], 'a1'), false, 'the same accounts — nothing to push')
    assert.equal(accountsMoved(book, ['a1', 'a2'], 'a1'), true)
    assert.equal(accountsMoved(book, ['a1'], null), true, 'the main account unstarred')
    assert.equal(accountsMoved(book, [], null), false, 'unmarking everything is never a rebind')
    assert.equal(accountsMoved([BOOK[1]], ['a2'], 'a2'), false, 'a live leg is not re-pointable')
})

test('a book with nothing placed is pending', () => {
    assert.equal(bookPending([BOOK[0]]), true)
    assert.equal(bookPending(bookIdeas(BOOK, 'p1')), false)
})

test('the AVOID ask names each name and industry; a proposal says Cancel applies the rest', () => {
    const one = avoidQuestion([{ asset: 'XOM', industry: 'Oil & Gas' }])
    assert.match(one, /XOM \(Oil & Gas\) AVOID/)
    assert.match(one, /Save the book with it anyway\?/)
    const two = avoidQuestion([{ asset: 'XOM', industry: 'Oil & Gas' }, { asset: 'CVX' }], { proposal: true })
    assert.match(two, /XOM \(Oil & Gas\), CVX AVOID/)
    assert.match(two, /Cancel applies the other changes without them/)
})

test('the sleeves line names each sleeve and its lens, or nothing', () => {
    assert.equal(sleeveLine(null), null)
    assert.equal(sleeveLine([{ lens: 'growth' }]), null, 'a request with no sector is not a sleeve')
    assert.match(sleeveLine([{ sector: 'Technology', lens: 'growth' }]), /^Technology \(growth\) sleeve sent/)
    assert.match(sleeveLine([{ sector: 'A' }, { sector: 'B' }, { sector: 'C' }]), /^A, B and C sleeves sent/)
})

test('what a press did is said without claiming more than the result', () => {
    assert.match(pressReport('generate', { portfolio: { ideas: [1, 2] }, failed: [{}] }, { name: 'Quality' }), /^Quality is saved — 2 holdings, 1 could not be\./)
    assert.match(pressReport('update', { left: [{ asset: 'KO' }] }), /could not be removed \(KO\)/)
    assert.match(pressReport('update', { rebound: 2 }), /marked accounts are on 2 holdings/)
    assert.match(pressReport('accept', { held: true }), /^Reviewed — holding as is\./)
    assert.match(pressReport('accept', { rebalance: { applied: 2, failed: [], deferredItems: [] } }), /^2 changes applied\./)
    assert.match(pressReport('accept', { rebalance: { applied: 1, deferredItems: [] } }, { pending: true }), /Activate the book/)
    assert.match(pressReport('dismiss', {}), /^Review dismissed\./)
    assert.equal(pressReport('later', {}), null)
})

test('a refused Accept says the server\'s words and each per-change reason once', () => {
    assert.equal(refusalText({ message: 'None applied', extra: { failed: [{ reason: 'market_closed' }, { reason: 'market_closed' }, { reason: 'no_position' }] } }),
        'None applied (market_closed, no_position)')
    assert.equal(refusalText({ message: 'No' }), 'No')
})

test('a proposed change reads as what Accept will do', () => {
    const assetOf = (id) => ({ i1: 'MSFT' })[id] ?? id
    assert.equal(describeChange({ action: 'trim_item', itemId: 'i1', reduceFraction: 0.25, targetAllocationRatio: 0.1 }, assetOf), 'Trim MSFT by 25% → target 10%')
    assert.equal(describeChange({ action: 'add_item', item: { asset: 'XOM', allocationRatio: 0.05 }, avoid: { industry: 'Oil & Gas' } }), 'Add XOM (long, target 5%) — Pythia rates Oil & Gas AVOID')
    assert.equal(describeChange({ action: 'exit_item', itemId: 'i1', reason: 'thesis broke' }, assetOf), 'Exit MSFT — thesis broke')
    assert.equal(describeChange({ action: 'mystery' }), 'mystery')
})
