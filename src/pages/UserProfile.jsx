import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../cmps/AuthModal/useAuth'
import './UserProfile.scss'

export function UserProfile() {
    const { user, signout } = useAuth()
    const navigate = useNavigate()

    useEffect(() => {
        if (!user) navigate('/')
    }, [user, navigate])

    if (!user) return null

    const stored = JSON.parse(sessionStorage.getItem('loggedinUser') || '{}')
    const username = stored.username || user.username || '—'
    const fullname = stored.fullname || user.fullname || '—'

    async function handleSignout() {
        await signout()
        navigate('/')
    }

    return (
        <div className="user-profile">
            <div className="user-profile__card">
                <h2 className="user-profile__title">Profile</h2>

                <div className="user-profile__field">
                    <span className="user-profile__label">Username</span>
                    <span className="user-profile__value">{username}</span>
                </div>

                <div className="user-profile__field">
                    <span className="user-profile__label">Full name</span>
                    <span className="user-profile__value">{fullname}</span>
                </div>

                <button className="user-profile__signout" onClick={handleSignout}>
                    Sign out
                </button>
            </div>
        </div>
    )
}
