// The Hotlist panel's hand-offs a row's page reads (Roy, 2026-11-21): `onChat` — "Chat about it", Axl on the name (the
// panel closes the way Build does). Its own module: a component file exporting a hook breaks React's fast refresh.
import { createContext, useContext } from 'react'

export const HotlistPageContext = createContext({ onChat: null })

/** The opener for "Chat about it" — null outside the Hotlist panel. */
export const useHotlistChat = () => useContext(HotlistPageContext).onChat
