import { useContext, useEffect, useState } from 'react'
import { AuthContext } from '../context/AuthContext'
import { situationService } from '../services/situation/situation.service.remote.js'

// May the signed-in user see the situation network's board? (docs/design/situation-network.md §11.6: an allow-list on
// the server, Roy and Marce during the forward test.) Asked ONCE per user — the Menu and the header ask together, so the
// question in flight is shared — and remembered for the session; false until the answer comes, and false for everyone
// off the list: the Menu shows no "Situation" for them at all.

const _asked = new Map()   // user id → Promise<boolean>
const _known = new Map()   // user id → true / false

function ask(id) {
    if (!_asked.has(id)) _asked.set(id, situationService.access().then(ok => { _known.set(id, ok); return ok }))
    return _asked.get(id)
}

export function useSituationAccess() {
    const user = useContext(AuthContext)?.user ?? null   // tolerant of a tree with no auth provider (tests)
    const id = user?._id ?? user?.id ?? null
    const [allowed, setAllowed] = useState(() => (id ? _known.get(id) ?? false : false))
    useEffect(() => {
        if (!id) { setAllowed(false); return }
        if (_known.has(id)) { setAllowed(_known.get(id)); return }
        let live = true
        ask(id).then(ok => { if (live) setAllowed(ok) })
        return () => { live = false }
    }, [id])
    return allowed
}

/** For tests: forget the answers. */
export function _resetSituationAccess() { _asked.clear(); _known.clear() }
