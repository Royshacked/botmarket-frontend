import { describe, test, expect, vi, beforeEach } from 'vitest'

// The one doorway into an entity's own desk. Three surfaces reach edit/review mode — a social-chat
// card, a list pencil, an Axl hand-off — and they used to each resolve the id against whatever list
// they happened to hold, which made "can I open this?" a question about client state. A card that
// arrived before its list had loaded opened nothing; a stale list opened the wrong version.

const getIdea      = vi.fn()
const getSetup     = vi.fn()
const getCoverage  = vi.fn()
const getScan      = vi.fn()
const getItems     = vi.fn()
const listSetups     = vi.fn()
const listCoverage   = vi.fn()
const listPortfolios = vi.fn()

vi.mock('./tradeIdeas/tradeIdeas.service.remote', () => ({ tradeIdeasService: { getIdea: (...a) => getIdea(...a) } }))
vi.mock('./mentor/mentor.service.remote',         () => ({ mentorService:     { getSetup: (...a) => getSetup(...a), listSetups: (...a) => listSetups(...a) } }))
vi.mock('./analyst/analyst.service.remote',       () => ({ analystService:    { getCoverage: (...a) => getCoverage(...a), listCoverage: (...a) => listCoverage(...a) } }))
vi.mock('./scanner/scanner.service.remote',       () => ({ scannerService:    { getScan: (...a) => getScan(...a) } }))
vi.mock('./portfolio/portfolio.service.remote',   () => ({ portfolioService:  { getItems: (...a) => getItems(...a), listPortfolios: (...a) => listPortfolios(...a) } }))

const { resolveEntity, resolveForEdit } = await import('./entityResolve.js')

beforeEach(() => vi.clearAllMocks())

describe('resolveEntity', () => {
    test('routes each kind to that kind\'s own getter, by id', async () => {
        getIdea.mockResolvedValue({ id: 'i1' })
        getSetup.mockResolvedValue({ id: 's1' })
        getCoverage.mockResolvedValue({ id: 'v1' })
        getScan.mockResolvedValue({ id: 'n1' })

        expect(await resolveEntity('idea', 'i1')).toEqual({ id: 'i1' })
        expect(await resolveEntity('setup', 's1')).toEqual({ id: 's1' })
        expect(await resolveEntity('coverage', 'v1')).toEqual({ id: 'v1' })
        expect(await resolveEntity('scan', 'n1')).toEqual({ id: 'n1' })
        expect(getIdea).toHaveBeenCalledWith('i1')
    })

    // A book is not a document — it exists as the items carrying its id — so its read answers an
    // ARRAY, and an empty one is a real book with nothing in it.
    test('a portfolio resolves to its holdings', async () => {
        getItems.mockResolvedValue([{ id: 'a' }, { id: 'b' }])
        expect(await resolveEntity('portfolio', 'p1')).toHaveLength(2)
    })

    test('an empty book is an empty list, NOT a failure', async () => {
        getItems.mockResolvedValue([])
        const out = await resolveEntity('portfolio', 'p1')
        expect(out).toEqual([])
        expect(out).not.toBeNull()
    })

    // The failure that started all this: a book that could not be read was indistinguishable from a
    // book with no holdings, so a review got authored against nothing, invented its item ids, and
    // every accepted change came back not_found. A throw must surface as null — never as an empty
    // stand-in the caller carries on with.
    test('a failed read is null, never an empty stand-in', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        getItems.mockRejectedValue(new Error('network'))
        expect(await resolveEntity('portfolio', 'p1')).toBeNull()

        getIdea.mockRejectedValue(new Error('404'))
        expect(await resolveEntity('idea', 'i1')).toBeNull()
    })

    test('an unknown kind or a missing id resolves null without calling anything', async () => {
        expect(await resolveEntity('nonsense', 'x')).toBeNull()
        expect(await resolveEntity('idea', '')).toBeNull()
        expect(await resolveEntity('idea', undefined)).toBeNull()
        expect(getIdea).not.toHaveBeenCalled()
    })
})

// ── resolveForEdit: an id, or the name a person would use ────────────────────
//
// An Axl hand-off names things the way people do — "the NVDA setup", "my Growth book". This lived
// inside MainPage's openForEdit, in a 3,000-line component with no test of its own, so the one
// genuinely subtle rule — a name is answered ONLY when it matches exactly one row — was
// unverifiable. It is the rule that decides whether the user edits the trade they meant.

describe('resolveForEdit', () => {
    test('an id wins outright, and no list is fetched', async () => {
        getSetup.mockResolvedValue({ id: 's1', asset: 'NVDA' })
        expect(await resolveForEdit('setup', 's1')).toEqual({ id: 's1', asset: 'NVDA' })
        expect(listSetups).not.toHaveBeenCalled()
    })

    test('a name resolves when exactly one row carries it', async () => {
        getSetup.mockResolvedValue(null)
        listSetups.mockResolvedValue([{ id: 's1', asset: 'NVDA' }, { id: 's2', asset: 'AAPL' }])
        expect(await resolveForEdit('setup', 'nvda')).toMatchObject({ id: 's1' })
    })

    test('AMBIGUITY OPENS NOTHING — two NVDA setups is a coin flip, so it declines', async () => {
        // The rule this whole function exists for. Guessing here means editing a different trade
        // than the one meant, on a live position; the caller opens the desk normally instead.
        getSetup.mockResolvedValue(null)
        listSetups.mockResolvedValue([{ id: 's1', asset: 'NVDA' }, { id: 's2', asset: 'NVDA' }])
        expect(await resolveForEdit('setup', 'NVDA')).toBeNull()
    })

    test('a scan is a list, not a name — id or nothing', async () => {
        getScan.mockResolvedValue(null)
        expect(await resolveForEdit('scan', 'my scan')).toBeNull()
    })

    test('coverage without a symbol is NOT resolved, by id or by name', async () => {
        // Prometheus matches on symbol and its opener bails silently without one, so reporting
        // success lands the user at the hub with nothing open and no reason given.
        getCoverage.mockResolvedValue({ id: 'c1', symbol: null })
        listCoverage.mockResolvedValue([{ id: 'c1', symbol: null }])
        expect(await resolveForEdit('coverage', 'c1')).toBeNull()
    })

    test('a book normalises to { portfolioId } from either path', async () => {
        // A book is not a document — it exists as the items carrying its id — so "found" means its
        // items exist, and the opener wants the id rather than a row.
        getItems.mockResolvedValue([{ id: 'i1' }])
        expect(await resolveForEdit('portfolio', 'pf_1')).toEqual({ portfolioId: 'pf_1' })

        getItems.mockResolvedValue([])
        listPortfolios.mockResolvedValue([{ portfolioId: 'pf_9', name: 'Growth' }])
        expect(await resolveForEdit('portfolio', 'growth')).toEqual({ portfolioId: 'pf_9' })
    })

    test('an empty book by id falls through to the name, rather than reporting found', async () => {
        getItems.mockResolvedValue([])
        listPortfolios.mockResolvedValue([])
        expect(await resolveForEdit('portfolio', 'pf_1')).toBeNull()
    })

    test('a failed list lookup declines instead of throwing at the doorway', async () => {
        getSetup.mockResolvedValue(null)
        listSetups.mockRejectedValue(new Error('offline'))
        expect(await resolveForEdit('setup', 'NVDA')).toBeNull()
    })

    test('no kind or no ref is nothing to open', async () => {
        expect(await resolveForEdit(null, 'x')).toBeNull()
        expect(await resolveForEdit('setup', '')).toBeNull()
    })
})
