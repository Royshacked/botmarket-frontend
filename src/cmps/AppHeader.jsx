import { useContext } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { AuthContext } from '../context/AuthContext'
import { HeaderBackground } from './HeaderBackground'
import { SocialChat } from './SocialChat/SocialChat'
import { useChatWs } from '../customHooks/useChatWs'
import { usePaperMode } from '../customHooks/usePaperMode'

export function AppHeader() {
	const { user }     = useContext(AuthContext)
	const navigate     = useNavigate()
	const { pathname } = useLocation()
	const onProfile    = pathname === '/profile'

	const { unread, setUnread, showChat, setShowChat } = useChatWs(user?._id)
	const isPaper = usePaperMode(user?._id)

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
					<span
						className={`app-header__mode ${isPaper ? 'paper' : 'live'}`}
						title={isPaper
							? 'Paper (simulated) mode — new ideas route to a simulated account'
							: 'Live mode — new ideas route to your live broker'}
					>
						{isPaper ? 'PAPER' : 'LIVE'}
					</span>
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

			{showChat && user && createPortal(
				<SocialChat
					currentUserId={user._id}
					onUnreadChange={setUnread}
					onClose={() => setShowChat(false)}
				/>,
				document.body
			)}
		</header>
	)
}
