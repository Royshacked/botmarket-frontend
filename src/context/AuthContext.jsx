import { createContext, useContext, useState, useEffect } from 'react'
import { API_BASE } from '../services/config'
import { hydratePreferences } from '../services/preferences.service'

export const AuthContext = createContext(null)

export function AuthProvider({ children }) {
    const [user, setUser]         = useState(null)
    const [isLoading, setIsLoading] = useState(true)

    // On mount — check if a session cookie already exists.
    // Guard with a timeout so a hung request (e.g. backend restarting) falls
    // through to the sign-in screen instead of sticking on "Connecting to server…".
    //
    // DELIBERATELY raw fetch, not httpService: a 401 here is the EXPECTED answer for a
    // logged-out visitor, and httpService turns any 401 into sessionStorage.clear() +
    // a redirect to '/' — which from the sign-in screen is a reload loop. Same reason
    // in AuthModal. Every other call in the app must go through httpService.
    useEffect(() => {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 8000)
        fetch(`${API_BASE}/api/auth/me`, { credentials: 'include', signal: ctrl.signal })
            .then(async res => {
                if (res.ok) {
                    const data = await res.json()
                    sessionStorage.setItem('loggedinUser', JSON.stringify(data))
                    setUser(data)
                    // Pull the account's saved UI preferences on session restore.
                    hydratePreferences(data._id)
                } else {
                    setUser(null)
                }
            })
            .catch(() => setUser(null))
            .finally(() => {
                clearTimeout(timer)
                setIsLoading(false)
            })
        return () => { clearTimeout(timer); ctrl.abort() }
    }, [])

    async function signout() {
        try {
            await fetch(`${API_BASE}/api/auth/signout`, {
                method: 'POST',
                credentials: 'include',
            })
        } catch { /* ignore */ }
        sessionStorage.clear()
        setUser(null)
    }

    const isAdmin = user?.role === 'admin'

    return (
        <AuthContext.Provider value={{ user, setUser, signout, isLoading, isAdmin }}>
            {children}
        </AuthContext.Provider>
    )
}

// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with its context provider
export function useAuth() {
    return useContext(AuthContext)
}
