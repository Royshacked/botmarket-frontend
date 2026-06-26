import { useContext, useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { AuthContext } from '../context/AuthContext'
import { HeaderBackground } from './HeaderBackground'
import { chatWsService } from '../services/chat/chatWs.service'
import { SocialChat } from './SocialChat/SocialChat'

export function AppHeader() {
	const { user }   = useContext(AuthContext)
	const navigate   = useNavigate()
	const { pathname } = useLocation()
	const onProfile  = pathname === '/profile'

	const [showChat,  setShowChat]  = useState(false)
	const [unread,    setUnread]    = useState(0)

	// Connect / disconnect WS with user session
	useEffect(() => {
		if (!user) { chatWsService.disconnect(); return }
		chatWsService.connect()
		return () => chatWsService.disconnect()
	}, [user?._id])

	useEffect(() => {
		const params = new URLSearchParams(window.location.search)
		if (params.get('broker') === 'connected') {
			window.history.replaceState({}, '', window.location.pathname)
			navigate('/profile')
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only OAuth redirect; navigate is stable
	}, [])

	return (
		<header className="app-header full">
			<div className="app-header__bg-wrap">
				<HeaderBackground userName={user?.fullname} />
			</div>

			<div className="app-header__brand">
				<img
					className="app-header__logo"
					src="/img/bot-market-logo.png"
					alt="TRADVICE"
					width={80}
					height={80}
				/>
				<h1>TRADVICE</h1>
			</div>

			{user && (
				<div className="app-header__user-wrap">
					<button
						className="app-header__chat-btn"
						onClick={() => setShowChat(v => !v)}
						title="Messages"
					>
						💬
						{unread > 0 && (
							<span className="app-header__chat-badge">{unread > 9 ? '9+' : unread}</span>
						)}
					</button>

					{onProfile
						? <button className="app-header__user" onClick={() => navigate('/')}>
							← Back to Trading
						</button>
						: <button className="app-header__user" onClick={() => navigate('/profile')}>
							👤 {user.fullname}
						</button>
					}
				</div>
			)}

			{showChat && user && (
				<SocialChat
					currentUserId={user._id}
					onUnreadChange={setUnread}
					onClose={() => setShowChat(false)}
				/>
			)}
		</header>
	)
}
