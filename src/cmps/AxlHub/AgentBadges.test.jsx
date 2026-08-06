import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'

import { AgentGlyph } from './AgentBadges.jsx'
import { AGENTS, DESKS } from './agentMeta.jsx'

afterEach(cleanup)

// A desk agent is drawn in a dozen places — the panel intro, the turn tag, the summon orb, the
// notification lists. What keeps them looking like ONE set is the badge: a 200-space figure at the
// shared stroke weight. An agent with no badge silently falls back to its 24-space line sigil,
// which reads thinner and ringless beside the rest — the drift is invisible in code review and
// obvious on screen, so it is asserted here.
describe('agent badges', () => {
    for (const desk of DESKS) {
        it(`${AGENTS[desk.agentKey].brand} is drawn as a badge, like the other desks`, () => {
            const { container } = render(<AgentGlyph agentKey={desk.agentKey} icon={AGENTS[desk.agentKey].icon} size={48} />)
            const svg = container.querySelector('svg')
            expect(svg.getAttribute('viewBox')).toBe('0 0 200 200')
            expect(svg.querySelector('circle[r="95"]')).toBeTruthy()   // the ring
        })
    }

    it('bare drops the ring but keeps the figure', () => {
        const { container } = render(<AgentGlyph agentKey="strategy" icon={AGENTS.strategy.icon} bare />)
        expect(container.querySelector('circle[r="95"]')).toBeNull()
        expect(container.querySelector('svg').getAttribute('viewBox')).toBe('0 0 200 200')
    })

    // Axl is the meta-layer, not a desk — it has no badge on purpose and falls back to its sigil.
    it('axl falls back to its line sigil', () => {
        const { container } = render(<AgentGlyph agentKey="axl" icon={AGENTS.axl.icon} />)
        expect(container.querySelector('svg').getAttribute('viewBox')).toBe('0 0 24 24')
    })
})
