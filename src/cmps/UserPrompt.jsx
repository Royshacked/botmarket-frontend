import { useState } from "react"
import { userPromptService } from "../services/userPrompt/userPrompt.service.remote.js"


export function UserPrompt() {
    const [prompt, setPrompt] = useState('')
    const [submittedPrompt, setSubmittedPrompt] = useState('')
    const [analysis, setAnalysis] = useState(null)

    function onChange(ev) {

    function onChange(ev) {
        setPrompt(ev.target.value)
    }

    function onSubmit(ev) {
        ev.preventDefault()
        if (!prompt.trim()) return
        const nextPrompt = prompt.trim()
        setSubmittedPrompt(nextPrompt)
        setPrompt('')

        const assistantData = analysis?.analysis ?? analysis
        const sessionId = assistantData?.sessionId ?? null
        const payload = sessionId ? { userPrompt: nextPrompt, sessionId } : nextPrompt

        userPromptService.sendPrompt(payload)
            .then(res => {
                setAnalysis(res)
            })
            .catch(err => {
                console.log(err)
            })
    }

    const reply = analysis?.reply ?? ''

    return (
        <div className="user-prompt">
            <section className="user-prompt__card">
                <div className="user-prompt__header">Trading Instructions</div>
                <form className="user-prompt__body" onSubmit={onSubmit}>
                    <input
                        className="user-prompt__input"
                        name="prompt"
                        type="text"
                        value={prompt}
                        onChange={onChange}
                        placeholder="what do you want to analyze?"
                    />

                    <div className="user-prompt__actions">
                        <button className="user-prompt__submit" type="submit">
                            Generate Analysis
                        </button>
                    </div>
                </form>

                <div className="user-prompt__thread">
                    {submittedPrompt && (
                        <div className="user-prompt__bubble user">
                            {submittedPrompt}
                        </div>
                    )}

                    {assistantData && (
                        <div className="user-prompt__bubble assistant">
                            <p>{assistantData.summary || assistantData.clarify?.question}</p>
                            {assistantData.sentiment && (
                                <p className="user-prompt__sentiment">
                                    Sentiment: {assistantData.sentiment}
                                </p>
                            )}
                        </div>
                    )}
                </div>

            </section>
        </div>
    )
}
