import { eventBus, SHOW_MSG } from '../services/event-bus.service'
import { useState, useEffect, useRef } from 'react'
import { BotAvatarGlyph } from './AxlHub/AgentSummon'

// Rich body for an incoming social-chat message (`msg.preview`, built by chatPreviewParts):
// the sender's avatar — the agent's own tinted sigil for a bot, an initial disc for a human —
// beside their name and the message line. Plain app toasts keep the flat `txt`.
function ChatPreview({ preview }) {
	const { who, body, agentKey, hue } = preview
	const avatarCls = 'user-msg__avatar'
		+ (agentKey ? ' user-msg__avatar--bot' : '')
		+ (hue && agentKey !== 'axl' ? ` user-msg__avatar--${hue}` : '')

	return (
		<div className="user-msg__chat">
			<span className={avatarCls}>
				{agentKey ? <BotAvatarGlyph agentKey={agentKey} size={26} /> : (who?.[0]?.toUpperCase() ?? '💬')}
			</span>
			<span className="user-msg__lines">
				<span className="user-msg__who">{who ?? 'New message'}</span>
				<span className="user-msg__text">{body}</span>
			</span>
			<span className="user-msg__open" aria-hidden="true">›</span>
		</div>
	)
}

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
			// The rich preview splits the line into name + body; the flat text stays the
			// accessible name so what's announced doesn't depend on the layout.
			aria-label={msg?.preview ? msg.txt : undefined}
		>
			<button className="user-msg__close" aria-label="Dismiss" onClick={e => { e.stopPropagation(); closeMsg() }}>×</button>
			{msg?.preview ? <ChatPreview preview={msg.preview} /> : msg?.txt}
		</section>
	)
}
