import { useState, useRef, useCallback } from 'react'

const BACKEND_URL = import.meta.env.PROD ? '' : 'http://localhost:3030'

/**
 * Hold-to-talk mic input hook.
 * Call start() on mousedown, stop() on mouseup/mouseleave.
 * onTranscript(text) is called when transcription succeeds.
 */
export function useMicInput({ onTranscript }) {
    const [isRecording,    setIsRecording]    = useState(false)
    const [isTranscribing, setIsTranscribing] = useState(false)
    const [error,          setError]          = useState(null)
    const recorderRef = useRef(null)
    const chunksRef   = useRef([])

    const start = useCallback(async () => {
        setError(null)
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            const recorder = new MediaRecorder(stream)
            recorderRef.current = recorder
            chunksRef.current   = []

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data)
            }

            recorder.onstop = async () => {
                stream.getTracks().forEach(t => t.stop())
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
                if (blob.size < 1000) return   // too short — ignore

                setIsTranscribing(true)
                try {
                    const res  = await fetch(`${BACKEND_URL}/api/transcribe`, {
                        method:      'POST',
                        headers:     { 'Content-Type': 'audio/webm' },
                        body:        blob,
                        credentials: 'include',
                    })
                    const data = await res.json()
                    if (data.text?.trim()) onTranscript(data.text.trim())
                } catch (err) {
                    console.error('[mic] transcription failed', err)
                    setError('Transcription failed')
                } finally {
                    setIsTranscribing(false)
                }
            }

            recorder.start()
            setIsRecording(true)
        } catch (err) {
            console.error('[mic] getUserMedia failed', err)
            setError('Microphone access denied')
        }
    }, [onTranscript])

    const stop = useCallback(() => {
        if (recorderRef.current?.state === 'recording') {
            recorderRef.current.stop()
        }
        setIsRecording(false)
    }, [])

    return { isRecording, isTranscribing, error, start, stop }
}
