import { useEffect, useState } from 'react'
import { pushStatus, enablePush, disablePush, describeDevice } from '../../services/push.service.js'
import { showErrorMsg, showSuccessMsg } from '../../services/event-bus.service'
import './PushAlertsSection.scss'

// The Alerts tab of the profile: one switch — does THIS device get the desks' cards as OS
// notifications. Per device on purpose: a push subscription belongs to a browser profile, so the
// phone and the desktop are each turned on where they are. Every card that lands in social chat
// is what goes out; the device stays quiet on its own when the app is focused there.

const COPY = {
    unsupported: 'This browser cannot show push notifications. On iPhone, add the app to the home screen first.',
    denied:      'Notifications are blocked for this site. Allow them in the browser\'s site settings, then come back.',
    off:         'Get every desk card — a setup firing, a fill to confirm, the morning brief — as a notification on this device, even with the app closed.',
    on:          'This device gets a notification for every card the desks post. The app stays quiet while it is in front of you.',
}

export function PushAlertsSection() {
    const [status, setStatus] = useState(null)   // null while asking the browser
    const [busy,   setBusy]   = useState(false)

    useEffect(() => {
        let alive = true
        pushStatus().then(s => { if (alive) setStatus(s) }).catch(() => { if (alive) setStatus('unsupported') })
        return () => { alive = false }
    }, [])

    async function toggle() {
        if (busy || !status) return
        setBusy(true)
        try {
            if (status === 'on') {
                await disablePush()
                setStatus('off')
                showSuccessMsg('Alerts off on this device')
            } else {
                await enablePush()
                setStatus('on')
                showSuccessMsg('Alerts on — this device will be notified')
            }
        } catch (err) {
            showErrorMsg(err?.message || 'Could not change alerts')
            setStatus(await pushStatus().catch(() => 'unsupported'))
        } finally {
            setBusy(false)
        }
    }

    const canToggle = status === 'on' || status === 'off'
    return (
        <section className="user-profile__section">
            <h2 className="user-profile__section-title">Alerts</h2>
            <div className="user-profile__row">
                <span className="user-profile__label">Notifications on this device</span>
                <span className="user-profile__value">
                    {status === null ? '…' : status === 'on' ? 'On' : status === 'off' ? 'Off' : status === 'denied' ? 'Blocked' : 'Unavailable'}
                </span>
            </div>
            <p className="push-alerts__copy">{status ? COPY[status] : ''}</p>
            {/* The device, named: a subscription belongs to one browser profile on one origin, and
                "it was on, now it's off" is nearly always a different one of those. */}
            <p className="push-alerts__device">{describeDevice().line}</p>
            {canToggle && (
                <button
                    className={`user-profile__btn ${status === 'on' ? 'user-profile__btn--ghost' : 'user-profile__btn--primary'}`}
                    onClick={toggle}
                    disabled={busy}
                >
                    {busy ? 'Working…' : status === 'on' ? 'Turn off on this device' : 'Turn on for this device'}
                </button>
            )}
        </section>
    )
}
