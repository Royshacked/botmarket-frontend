import ReactDOM from 'react-dom/client'
import { BrowserRouter as Router } from 'react-router'

import { RootCmp } from './RootCmp'
import { AuthProvider } from './context/AuthContext'

import './assets/styles/main.scss'
import { initTheme } from './services/themeService'
import { initDesign } from './services/designService'

initTheme()
initDesign()

const root = ReactDOM.createRoot(document.getElementById('root'))
root.render(
	<Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
		<AuthProvider>
			<RootCmp />
		</AuthProvider>
	</Router>
)
