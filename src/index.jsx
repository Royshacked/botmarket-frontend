import ReactDOM from 'react-dom/client'

import { BrowserRouter as Router } from 'react-router-dom'
import { Provider } from 'react-redux'


import { store } from './store/store'
import { RootCmp } from './RootCmp'
import { AuthProvider } from './context/AuthContext'

import './assets/styles/main.scss'
import { initTheme, initAccent } from './services/themeService'
import { initDesign } from './services/designService'

// Apply saved theme (preset or generated spectrum hue) before first render to avoid flash
initTheme()
// Apply the saved design trial on top (dev A/B of whole visual identities)
initDesign()
// Apply the user's custom accent hue last, so it sits on top of theme + design
initAccent()

const root = ReactDOM.createRoot(document.getElementById('root'))
root.render(
	<Provider store={store}>
		<Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
			<AuthProvider>
				<RootCmp />
			</AuthProvider>
		</Router>
	</Provider>
)

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://cra.link/PWA
