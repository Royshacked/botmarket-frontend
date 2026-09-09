// The signed-in user a component test renders as.
//
// WHY THIS EXISTS. Four component suites — AxlHub, AnalystPanel, CoverageActions,
// SocialChat — call useAuth(), which is useContext(AuthContext) with a default of null.
// Rendered without a provider that destructures to
//
//     TypeError: Cannot destructure property 'isAdmin' of 'useAuth(...)' as it is null
//
// and takes the whole file down: 72 of the suite's 94 failures were this one line. The
// tests predate the auth gating entirely — not one of them mentions admin — so they were
// written against components that had no such dependency, and nobody saw it break
// because vitest had no jsdom environment and none of these files ran at all.
//
// NOT AuthProvider: that fetches /api/auth/me on mount and would put a real network call
// in every render. This is the value the provider would have produced.
//
// ADMIN BY DEFAULT, which is a decision and not a shrug. CoverageActions is
// `if (!isAdmin) return null` — as a plain user it renders nothing and its eight tests
// assert on markup that would never exist. Admin is also the state these tests were
// written in, before any of this was gated, so it reproduces what they were asserting.
// Pass a different value where a test is specifically about what a non-admin sees.

export const ADMIN = {
    user: { _id: 'u_admin', username: 'roy_shacked', role: 'admin' },
    isAdmin: true,
    isLoading: false,
    setUser: () => {},
    signout: () => {},
}

export const MEMBER = {
    user: { _id: 'u_member', username: 'member', role: 'user' },
    isAdmin: false,
    isLoading: false,
    setUser: () => {},
    signout: () => {},
}

/**
 * Swap useAuth() for a fixed value, keeping the rest of the module real — AuthContext
 * itself and AuthProvider stay importable, so a test that wants the genuine provider
 * still can.
 *
 * Used from a hoisted vi.mock factory, which cannot close over outer variables:
 *
 *     vi.mock('../../context/AuthContext.jsx', async (orig) => {
 *         const { authModule } = await import('../../testUtils/authStub.js')
 *         return authModule(await orig())
 *     })
 */
export function authModule(actual, value = ADMIN) {
    return { ...actual, useAuth: () => value }
}
