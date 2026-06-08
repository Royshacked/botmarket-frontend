import { useContext } from 'react'
import { Routes, Route, useLocation } from 'react-router'

import { AuthContext } from './context/AuthContext'
import { AuthModal } from './cmps/AuthModal/AuthModal'
import { AppHeader } from './cmps/AppHeader.jsx'
import { MainPage } from './pages/MainPage.jsx'
import { UserProfile } from './pages/UserProfile.jsx'
import { IdeaPage } from './pages/IdeaPage.jsx'

export function RootCmp() {
    const { user, isLoading } = useContext(AuthContext)
    const location = useLocation()

    // Idea pop-out window — no chrome, full viewport
    if (location.pathname.startsWith('/idea/')) return <IdeaPage />

    return (
        <>
            <div className={`main-container${user ? '' : ' app-blurred'}`}>
                <AppHeader />
                {/* Only mount routes once auth check is complete and user is confirmed.
                    Prevents MainPage from firing authenticated API calls while logged out,
                    which would trigger httpService's 401 → window.location.assign('/') loop. */}
                {!isLoading && user && (
                    <Routes>
                        <Route path="/"        element={<MainPage />} />
                        <Route path="/profile" element={<UserProfile />} />
                    </Routes>
                )}
            </div>
            <AuthModal />
        </>
    )
}
