import { describe, test, expect, vi, beforeEach } from 'vitest'

// The one doorway into an entity's own desk. Three surfaces reach edit/review mode — a social-chat
// card, a list pencil, an Axl hand-off — and they used to each resolve the id against whatever list
// they happened to hold, which made "can I open this?" a question about client state. A card that
// arrived before its list had loaded opened nothing; a stale list opened the wrong version.

const getIdea      = vi.fn()
const getCall      = vi.fn()
const getSetup     = vi.fn()
const getCoverage  = vi.fn()
const getScan      = vi.fn()
const getItems     = vi.fn()

vi.mock('./tradeIdeas/tradeIdeas.service.remote', () => ({ tradeIdeasService: { getIdea: (...a) => getIdea(...a) } }))
vi.mock('./kairos/kairos.service.remote',         () => ({ kairosService:     { getCall: (...a) => getCall(...a) } }))
vi.mock('./mentor/mentor.service.remote',         () => ({ mentorService:     { getSetup: (...a) => getSetup(...a) } }))
vi.mock('./analyst/analyst.service.remote',       () => ({ analystService:    { getCoverage: (...a) => getCoverage(...a) } }))
vi.mock('./scanner/scanner.service.remote',       () => ({ scannerService:    { getScan: (...a) => getScan(...a) } }))
vi.mock('./portfolio/portfolio.service.remote',   () => ({ portfolioService:  { getItems: (...a) => getItems(...a) } }))

const { resolveEntity } = await import('./entityResolve.js')

beforeEach(() => vi.clearAllMocks())

describe('resolveEntity', () => {
    test('routes each kind to that kind\'s own getter, by id', async () => {
        getIdea.mockResolvedValue({ id: 'i1' })
        getCall.mockResolvedValue({ id: 'c1' })
        getSetup.mockResolvedValue({ id: 's1' })
        getCoverage.mockResolvedValue({ id: 'v1' })
        getScan.mockResolvedValue({ id: 'n1' })

        expect(await resolveEntity('idea', 'i1')).toEqual({ id: 'i1' })
        expect(await resolveEntity('call', 'c1')).toEqual({ id: 'c1' })
        expect(await resolveEntity('setup', 's1')).toEqual({ id: 's1' })
        expect(await resolveEntity('coverage', 'v1')).toEqual({ id: 'v1' })
        expect(await resolveEntity('scan', 'n1')).toEqual({ id: 'n1' })
        expect(getIdea).toHaveBeenCalledWith('i1')
        expect(getCall).toHaveBeenCalledWith('c1')
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
