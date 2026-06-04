import React from 'react'
import ReactDOM from 'react-dom/client'

import { BrowserRouter as Router } from 'react-router-dom'
import { Provider } from 'react-redux'


import { store } from './store/store'
import { RootCmp } from './RootCmp'
import { AuthProvider } from './context/AuthContext'

import './assets/styles/main.scss'

// Apply saved theme before first render to avoid flash
const savedTheme = localStorage.getItem('theme') ?? 'ocean'
document.documentElement.setAttribute('data-theme', savedTheme)

const root = ReactDOM.createRoot(document.getElementById('root'))
root.render(
	<Provider store={store}>
		<Router>
			<AuthProvider>
				<RootCmp />
			</AuthProvider>
		</Router>
	</Provider>
)

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://cra.link/PWA
