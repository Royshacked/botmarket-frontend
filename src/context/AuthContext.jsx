import { createContext, useContext, useState, useEffect } from 'react'
import { API_BASE } from '../services/config'

export const AuthContext = createContext(null)

export function AuthProvider({ children }) {
    const [user, setUser]         = useState(null)
    const [isLoading, setIsLoading] = useState(true)

    // On mount — check if a session cookie already exists
    useEffect(() => {
        fetch(`${API_BASE}/api/auth/me`, { credentials: 'include' })
            .then(async res => {
                if (res.ok) {
                    const data = await res.json()
                    sessionStorage.setItem('loggedinUser', JSON.stringify(data))
                    setUser(data)
                } else {
                    setUser(null)
                }
            })
            .catch(() => setUser(null))
            .finally(() => setIsLoading(false))
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

    return (
        <AuthContext.Provider value={{ user, setUser, signout, isLoading }}>
            {children}
        </AuthContext.Provider>
    )
}

// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with its context provider
export function useAuth() {
    return useContext(AuthContext)
}
