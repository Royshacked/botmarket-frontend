import { useContext } from 'react'
import { useLocation } from 'react-router'

import { AuthContext } from './context/AuthContext'
import { AuthModal } from './cmps/AuthModal/AuthModal'
import { UserMsg } from './cmps/UserMsg.jsx'
import { AppHeaderAxl } from './cmps/AppHeaderAxl.jsx'
import { MainPage } from './pages/MainPage.jsx'
import { UserProfile } from './pages/UserProfile.jsx'
import { IdeaPage } from './pages/IdeaPage.jsx'

export function RootCmp() {
    const { user, isLoading } = useContext(AuthContext)
    const location = useLocation()

    // Idea pop-out window — no chrome, full viewport
    if (location.pathname.startsWith('/idea/')) return <IdeaPage />

    const onProfile = location.pathname === '/profile'

    return (
        <>
            <div className={`main-container${user ? '' : ' app-blurred'}`}>
                <AppHeaderAxl />
                {/* Only mount once auth check is complete and user is confirmed.
                    Prevents MainPage from firing authenticated API calls while logged out,
                    which would trigger httpService's 401 → window.location.assign('/') loop. */}
                {!isLoading && user && (
                    <>
                        {/* MainPage stays mounted across a profile visit so its in-memory
                            state (chat, analysis, chart, ideas, active tab…) survives. We
                            hide it instead of swapping routes — a route swap would unmount
                            it and reset every useState. `display:contents` keeps the grid
                            layout intact when visible (the wrapper generates no box). */}
                        <div style={{ display: onProfile ? 'none' : 'contents' }}>
                            <MainPage />
                        </div>
                        {onProfile && <UserProfile />}
                    </>
                )}
            </div>
            <AuthModal />
            <UserMsg />
        </>
    )
}
