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
							<path d="M12 4C6.5 4 2 6.9 2 10.5C2 12.4 3.3 14.1 5.4 15.2C5.2 16.3 4.4 17.6 3 19C5.6 18.8 7.6 18 9 17C9.9 17.3 10.9 17.5 12 17.5C17.5 17.5 22 14.6 22 10.5C22 6.9 17.5 4 12 4Z"/>
							<circle cx="8.5" cy="10" r="1.5"/>
							<path d="M5.9 14.5a2.6 2.6 0 0 1 5.2 0"/>
							<circle cx="15.5" cy="10" r="1.5"/>
							<path d="M12.9 14.5a2.6 2.6 0 0 1 5.2 0"/>
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
