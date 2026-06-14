import { useState, useRef, useCallback } from 'react'
import { API_BASE } from '../services/config'

/**
 * Toggle-to-talk mic input hook.
 * Call toggle() to start/stop recording.
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

        if (!navigator.mediaDevices?.getUserMedia) {
            setError('Microphone not supported in this browser')
            return
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

            // Pick the best supported MIME type — Whisper accepts webm, mp4, ogg
            const mimeType = ['audio/webm', 'audio/mp4', 'audio/ogg'].find(
                t => MediaRecorder.isTypeSupported(t)
            ) ?? ''

            const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
            recorderRef.current = recorder
            chunksRef.current   = []

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data)
            }

            recorder.onstop = async () => {
                stream.getTracks().forEach(t => t.stop())
                const actualType = recorder.mimeType || mimeType || 'audio/webm'
                const blob = new Blob(chunksRef.current, { type: actualType })
                if (blob.size < 1000) return   // too short — ignore

                setIsTranscribing(true)
                try {
                    const res  = await fetch(`${API_BASE}/api/transcribe`, {
                        method:      'POST',
                        headers:     { 'Content-Type': actualType },
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

    const toggle = useCallback(() => {
        if (isRecording) stop()
        else start()
    }, [isRecording, start, stop])

    return { isRecording, isTranscribing, error, toggle }
}
