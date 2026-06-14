import { useContext, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { AuthContext } from '../context/AuthContext'
import { HeaderBackground } from './HeaderBackground'

export function AppHeader() {
	const { user }   = useContext(AuthContext)
	const navigate   = useNavigate()
	const { pathname } = useLocation()
	const onProfile  = pathname === '/profile'

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
		</header>
	)
}
