import { useContext, useEffect, useRef, useState } from 'react'
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
	const showChatRef = useRef(false)
	useEffect(() => { showChatRef.current = showChat }, [showChat])

	// Connect / disconnect WS with user session
	useEffect(() => {
		if (!user) { chatWsService.disconnect(); return }
		chatWsService.connect()
		return () => chatWsService.disconnect()
	}, [user?._id])

	// Increment unread badge for messages that arrive while the panel is closed.
	// When the panel opens, SocialChat re-fetches the server count via onUnreadChange.
	useEffect(() => {
		if (!user) return
		function onNewMessage() {
			if (!showChatRef.current) setUnread(u => u + 1)
		}
		chatWsService.on('new_message', onNewMessage)
		return () => chatWsService.off('new_message', onNewMessage)
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
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
							<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
							<polyline points="7,12 10,9 13,11 17,7" strokeWidth="1.4"/>
						</svg>
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
