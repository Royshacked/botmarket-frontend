import { useState } from 'react'
import { useNavigate } from 'react-router'
import { signup } from '../store/actions/user.actions'
import { ImgUploader } from '../cmps/ImgUploader'
import { userService } from '../services/user'

function validatePassword(value) {
    if (value.length < 8) return 'At least 8 characters required'
    if ((value.match(/\d/g) ?? []).length < 2) return 'At least 2 numbers required'
    return ''
}

export function Signup() {
    const [credentials, setCredentials] = useState(userService.getEmptyUser())
    const [showPassword, setShowPassword] = useState(false)
    const [passwordError, setPasswordError] = useState('')
    const navigate = useNavigate()

    function clearState() {
        setCredentials({ username: '', password: '', fullname: '', imgUrl: '' })
        setPasswordError('')
    }

    function handleChange(ev) {
        const { name, value } = ev.target
        setCredentials(prev => ({ ...prev, [name]: value }))
        if (name === 'password') setPasswordError(validatePassword(value))
    }

    async function onSignup(ev) {
        if (ev) ev.preventDefault()
        if (!credentials.username || !credentials.password || !credentials.fullname) return
        const error = validatePassword(credentials.password)
        if (error) { setPasswordError(error); return }
        await signup(credentials)
        clearState()
        navigate('/')
    }

    function onUploaded(imgUrl) {
        setCredentials(prev => ({ ...prev, imgUrl }))
    }

    return (
        <form className="signup-form" onSubmit={onSignup}>
            <input
                type="text"
                name="fullname"
                value={credentials.fullname}
                placeholder="Full name"
                onChange={handleChange}
                required
            />
            <input
                type="text"
                name="username"
                value={credentials.username}
                placeholder="Username"
                onChange={handleChange}
                required
            />

            <div className="password-field">
                <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={credentials.password}
                    placeholder="Password"
                    onChange={handleChange}
                    required
                />
                <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(p => !p)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                    {showPassword ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                            fill="none" stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                            <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                            fill="none" stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                    )}
                </button>
            </div>

            {passwordError
                ? <span className="password-error">{passwordError}</span>
                : <span className="password-hint">Min 8 chars · at least 2 numbers</span>
            }

            <ImgUploader onUploaded={onUploaded} />
            <button>Signup</button>
        </form>
    )
}
