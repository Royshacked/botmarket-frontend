import { useState } from 'react'
import { useAuth } from './useAuth'
import { API_BASE } from '../../services/config'
import './AuthModal.scss'

function EyeIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
        </svg>
    )
}

function EyeOffIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
        </svg>
    )
}

async function authPost(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Something went wrong')
    return data
}

function validatePassword(value) {
    if (value.length < 8) return 'At least 8 characters required'
    if ((value.match(/\d/g) ?? []).length < 2) return 'At least 2 numbers required'
    return ''
}

export function AuthModal() {
    const { user, setUser, isLoading } = useAuth()

    const [tab, setTab]               = useState('signin')
    const [successMsg, setSuccessMsg] = useState('')
    const [error, setError]           = useState('')
    const [submitting, setSubmitting] = useState(false)

    const [signinForm, setSigninForm] = useState({ username: '', password: '' })
    const [signupForm, setSignupForm] = useState({ username: '', fullname: '', password: '', confirm: '' })

    // Show/hide toggles
    const [showSigninPw,  setShowSigninPw]  = useState(false)
    const [showSignupPw,  setShowSignupPw]  = useState(false)
    const [showConfirmPw, setShowConfirmPw] = useState(false)

    // Live password validation (signup only)
    const [passwordError, setPasswordError] = useState('')

    if (user) return null

    function switchTab(next) {
        setTab(next)
        setError('')
        setPasswordError('')
        if (next !== 'signin') setSuccessMsg('')
    }

    async function handleSignin(ev) {
        ev.preventDefault()
        setError('')
        setSubmitting(true)
        try {
            const data = await authPost('/api/auth/signin', {
                username: signinForm.username,
                password: signinForm.password,
            })
            sessionStorage.setItem('loggedinUser', JSON.stringify(data))
            setUser(data)
        } catch (err) {
            setError(err.message)
        } finally {
            setSubmitting(false)
        }
    }

    async function handleSignup(ev) {
        ev.preventDefault()
        setError('')
        const pwErr = validatePassword(signupForm.password)
        if (pwErr) { setPasswordError(pwErr); return }
        if (signupForm.password !== signupForm.confirm) {
            setError('Passwords do not match')
            return
        }
        setSubmitting(true)
        try {
            await authPost('/api/auth/signup', {
                username: signupForm.username,
                fullname: signupForm.fullname,
                password: signupForm.password,
            })
            setSuccessMsg('Account created — please sign in')
            setSigninForm({ username: signupForm.username, password: '' })
            setTab('signin')
        } catch (err) {
            setError(err.message)
        } finally {
            setSubmitting(false)
        }
    }

    function handleSignupPasswordChange(e) {
        const value = e.target.value
        setSignupForm(f => ({ ...f, password: value }))
        setPasswordError(validatePassword(value))
    }

    return (
        <div className="auth-modal__overlay">
            <div className="auth-modal" role="dialog" aria-modal="true">

                <div className="auth-modal__brand">
                    {/* axl — meditating bot mark (mirrors AppHeaderAxl) */}
                    <svg className="auth-modal__mark" viewBox="0 0 44 44" aria-hidden="true">
                        <defs>
                            <radialGradient id="authBotAura" cx="50%" cy="44%" r="62%">
                                <stop offset="0"   stopColor="#5BCBC0" stopOpacity="0.20" />
                                <stop offset="0.6" stopColor="#74C9AE" stopOpacity="0.10" />
                                <stop offset="1"   stopColor="#9E9BE3" stopOpacity="0.13" />
                            </radialGradient>
                            <linearGradient id="authBotRing" gradientUnits="userSpaceOnUse" x1="6" y1="6" x2="38" y2="38">
                                <stop offset="0"   stopColor="#7FD69E" />
                                <stop offset="0.5" stopColor="#5FB9D9" />
                                <stop offset="1"   stopColor="#9E9BE3" />
                            </linearGradient>
                        </defs>
                        <circle className="aura" cx="22" cy="22" r="20" />
                        <circle className="ring" cx="22" cy="22" r="20" />
                        {/* antenna */}
                        <line className="bot" x1="22" y1="9.3" x2="22" y2="7.3" />
                        <circle className="bot" cx="22" cy="6.1" r="1.1" />
                        {/* head */}
                        <rect className="bot" x="15.5" y="9.5" width="13" height="10" rx="3.6" />
                        {/* closed, content eyes (meditating) */}
                        <path className="bot" d="M18,14 q1.7,1.4 3.4,0" />
                        <path className="bot" d="M22.6,14 q1.7,1.4 3.4,0" />
                        {/* arms resting */}
                        <path className="bot" d="M16.6,20 C13.9,22.3 13.1,25.8 16,28" />
                        <path className="bot" d="M27.4,20 C30.1,22.3 30.9,25.8 28,28" />
                        {/* crossed legs / lotus base */}
                        <path className="bot" d="M13,30 Q22,26.2 31,30" />
                        <path className="bot" d="M14,30.5 Q22,34.6 30,30.5" />
                        <path className="bot" d="M19.4,31 L24.6,33.4" />
                        <path className="bot" d="M24.6,31 L19.4,33.4" />
                    </svg>
                    <span className="auth-modal__wordmark"><b>a</b>xl</span>
                </div>

                {isLoading ? (
                    <div className="auth-modal__connecting">
                        <span className="auth-modal__spinner" />
                        Connecting to server…
                    </div>
                ) : (
                    <>
                        <div className="auth-modal__tabs">
                            <button
                                className={`auth-modal__tab${tab === 'signin' ? ' active' : ''}`}
                                onClick={() => switchTab('signin')}
                                type="button"
                            >Sign in</button>
                            <button
                                className={`auth-modal__tab${tab === 'signup' ? ' active' : ''}`}
                                onClick={() => switchTab('signup')}
                                type="button"
                            >Sign up</button>
                        </div>

                        {successMsg && <p className="auth-modal__success">{successMsg}</p>}
                        {error      && <p className="auth-modal__error">{error}</p>}

                        {tab === 'signin' ? (
                            <form className="auth-modal__form" onSubmit={handleSignin} noValidate>
                                <input
                                    type="text"
                                    placeholder="Username"
                                    value={signinForm.username}
                                    onChange={e => setSigninForm(f => ({ ...f, username: e.target.value }))}
                                    autoComplete="username"
                                    required
                                />
                                <div className="auth-modal__pw-field">
                                    <input
                                        type={showSigninPw ? 'text' : 'password'}
                                        placeholder="Password"
                                        value={signinForm.password}
                                        onChange={e => setSigninForm(f => ({ ...f, password: e.target.value }))}
                                        autoComplete="current-password"
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="auth-modal__pw-toggle"
                                        onClick={() => setShowSigninPw(v => !v)}
                                        aria-label={showSigninPw ? 'Hide password' : 'Show password'}
                                    >
                                        {showSigninPw ? <EyeOffIcon /> : <EyeIcon />}
                                    </button>
                                </div>
                                <button type="submit" disabled={submitting}>
                                    {submitting ? 'Signing in…' : 'Sign in'}
                                </button>
                            </form>
                        ) : (
                            <form className="auth-modal__form" onSubmit={handleSignup} noValidate>
                                <input
                                    type="text"
                                    placeholder="Username"
                                    value={signupForm.username}
                                    onChange={e => setSignupForm(f => ({ ...f, username: e.target.value }))}
                                    autoComplete="username"
                                    required
                                />
                                <input
                                    type="text"
                                    placeholder="Full name"
                                    value={signupForm.fullname}
                                    onChange={e => setSignupForm(f => ({ ...f, fullname: e.target.value }))}
                                    autoComplete="name"
                                    required
                                />
                                <div className="auth-modal__pw-field">
                                    <input
                                        type={showSignupPw ? 'text' : 'password'}
                                        placeholder="Password"
                                        value={signupForm.password}
                                        onChange={handleSignupPasswordChange}
                                        autoComplete="new-password"
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="auth-modal__pw-toggle"
                                        onClick={() => setShowSignupPw(v => !v)}
                                        aria-label={showSignupPw ? 'Hide password' : 'Show password'}
                                    >
                                        {showSignupPw ? <EyeOffIcon /> : <EyeIcon />}
                                    </button>
                                </div>
                                {passwordError
                                    ? <span className="auth-modal__pw-error">{passwordError}</span>
                                    : <span className="auth-modal__pw-hint">Min 8 chars · at least 2 numbers</span>
                                }
                                <div className="auth-modal__pw-field">
                                    <input
                                        type={showConfirmPw ? 'text' : 'password'}
                                        placeholder="Confirm password"
                                        value={signupForm.confirm}
                                        onChange={e => setSignupForm(f => ({ ...f, confirm: e.target.value }))}
                                        autoComplete="new-password"
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="auth-modal__pw-toggle"
                                        onClick={() => setShowConfirmPw(v => !v)}
                                        aria-label={showConfirmPw ? 'Hide password' : 'Show password'}
                                    >
                                        {showConfirmPw ? <EyeOffIcon /> : <EyeIcon />}
                                    </button>
                                </div>
                                <button type="submit" disabled={submitting}>
                                    {submitting ? 'Creating account…' : 'Sign up'}
                                </button>
                            </form>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
