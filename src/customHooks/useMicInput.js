import { useState, useRef, useCallback } from 'react'
import { httpService } from '../services/http.service'

/**
 * Toggle-to-talk mic input hook.
 * Call toggle() to start/stop recording.
 * onTranscript(text) is called when transcription succeeds.
 */
export function useMicInput({ onTranscript }) {
    const [isRecording,    setIsRecording]    = useState(false)
    const [isTranscribing, setIsTranscribing] = useState(false)
    const [error,          setError]          = useState(null)
    const recorderRef  = useRef(null)
    const chunksRef    = useRef([])
    const cancelledRef = useRef(false)

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
            recorderRef.current  = recorder
            chunksRef.current    = []
            cancelledRef.current = false

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data)
            }

            recorder.onstop = async () => {
                stream.getTracks().forEach(t => t.stop())

                // Discarded by the user — drop the audio, never transcribe.
                if (cancelledRef.current) {
                    cancelledRef.current = false
                    chunksRef.current    = []
                    return
                }

                const actualType = recorder.mimeType || mimeType || 'audio/webm'
                const blob = new Blob(chunksRef.current, { type: actualType })
                if (blob.size < 1000) return   // too short — ignore

                setIsTranscribing(true)
                try {
                    // Raw audio body + its own Content-Type (the endpoint is mounted before
                    // express.json). Timeout is well above httpService's 30s default —
                    // transcribing a long recording legitimately takes a while.
                    const data = await httpService.post('api/transcribe', blob, {
                        headers: { 'Content-Type': actualType },
                        timeout: 120000,
                    })
                    if (data?.text?.trim()) onTranscript(data.text.trim())
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
            // Classify by DOMException name — the generic "access denied" was misleading for the
            // common no-device case. These are user-environment conditions, not code errors → warn.
            const name = err?.name
            const msg = (name === 'NotFoundError' || name === 'DevicesNotFoundError') ? 'No microphone found'
                : (name === 'NotAllowedError' || name === 'PermissionDeniedError')    ? 'Microphone access denied'
                : (name === 'NotReadableError' || name === 'TrackStartError')          ? 'Microphone is unavailable (in use by another app)'
                : 'Could not access the microphone'
            console.warn('[mic] getUserMedia failed:', name || err)
            setError(msg)
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

    // Abort the in-progress recording without transcribing it.
    const cancel = useCallback(() => {
        cancelledRef.current = true
        if (recorderRef.current?.state === 'recording') {
            recorderRef.current.stop()
        }
        setIsRecording(false)
        setError(null)
    }, [])

    return { isRecording, isTranscribing, error, toggle, cancel }
}
