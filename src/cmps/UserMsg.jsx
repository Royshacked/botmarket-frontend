import { eventBus, SHOW_MSG } from '../services/event-bus.service'
import { useState, useEffect, useRef } from 'react'

export function UserMsg() {
	const [msg, setMsg] = useState(null)
	const timeoutIdRef = useRef()

	useEffect(() => {
		const unsubscribe = eventBus.on(SHOW_MSG, msg => {
			setMsg(msg)
			if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current)
			// Broker rejections are worth reading — give errors a longer dwell.
			timeoutIdRef.current = setTimeout(closeMsg, msg?.type === 'error' ? 6000 : 3000)
		})

		return unsubscribe
	}, [])

	function closeMsg() {
		setMsg(null)
	}

    function msgClass() {
        return msg ? 'visible' : ''
    }
	return (
		<section className={`user-msg ${msg?.type} ${msgClass()}`}>
			<button onClick={closeMsg}>x</button>
			{msg?.txt}
		</section>
	)
}
