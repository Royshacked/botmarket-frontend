import { useState, useEffect, useCallback } from 'react'
import { scannerService } from '../services/scanner/scanner.service.remote.js'

/**
 * Owns the user's saved scan lists: initial load + create/delete with optimistic
 * local state so the NewsFeed "Scans" tab updates instantly on generate/delete.
 */
export function useScans() {
    const [scans, setScans] = useState([])
    const [loading, setLoading] = useState(true)

    const loadScans = useCallback(async () => {
        setLoading(true)
        try { setScans(await scannerService.listScans()) }
        catch (err) { console.error('[scans] load failed', err) }
        finally { setLoading(false) }
    }, [])

    useEffect(() => { loadScans() }, [loadScans])

    const createScan = useCallback(async (scan) => {
        try {
            const saved = await scannerService.createScan(scan)
            if (saved) setScans(prev => [saved, ...prev])
            return saved
        } catch (err) {
            console.error('[scans] create failed', err)
            return null
        }
    }, [])

    const updateScan = useCallback(async (id, patch) => {
        try {
            const saved = await scannerService.updateScan(id, patch)
            if (saved) setScans(prev => prev.map(s => s.id === id ? saved : s))
            return saved
        } catch (err) {
            console.error('[scans] update failed', err)
            return null
        }
    }, [])

    const deleteScan = useCallback(async (id) => {
        const prev = scans
        setScans(p => p.filter(s => s.id !== id))   // optimistic
        try { await scannerService.deleteScan(id) }
        catch (err) {
            console.error('[scans] delete failed', err)
            setScans(prev)                           // rollback
        }
    }, [scans])

    return { scans, loading, loadScans, createScan, updateScan, deleteScan }
}
