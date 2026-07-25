import { eventBus, SHOW_MSG } from '../services/event-bus.service'
import { useState, useEffect, useRef } from 'react'

export function UserMsg() {
	const [msg, setMsg] = useState(null)
	const timeoutIdRef = useRef()

	useEffect(() => {
		const unsubscribe = eventBus.on(SHOW_MSG, msg => {
			setMsg(msg)
			if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current)
			// A notification (a bot chat preview) is NEVER auto-dismissed — it persists until the
			// user clicks it (which routes to the message in social chat) or closes it. Plain app
			// toasts (success/error/info) still auto-hide; errors get a longer read.
			if (msg?.type === 'chat') return
			const longDwell = msg?.type === 'error'
			timeoutIdRef.current = setTimeout(closeMsg, longDwell ? 6000 : 3000)
		})

		return unsubscribe
	}, [])

	function closeMsg() {
		setMsg(null)
	}

    function msgClass() {
        return msg ? 'visible' : ''
    }

    // An actionable toast (e.g. a chat preview) carries an onClick; clicking the
    // body runs it and dismisses. The close button opts out via stopPropagation.
    function handleActivate() {
        const cb = msg?.onClick
        closeMsg()
        cb?.()
    }

    const clickable = !!msg?.onClick
	return (
		<section
			className={`user-msg ${msg?.type} ${msgClass()} ${clickable ? 'clickable' : ''}`}
			onClick={clickable ? handleActivate : undefined}
			onKeyDown={clickable ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleActivate() } }) : undefined}
			role={clickable ? 'button' : undefined}
			tabIndex={clickable ? 0 : undefined}
		>
			<button onClick={e => { e.stopPropagation(); closeMsg() }}>x</button>
			{msg?.txt}
		</section>
	)
}
