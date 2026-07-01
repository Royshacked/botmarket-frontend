# Project Context
Frontend for the ar2trade / TRADVICE trading assistant — React + Vite (SCSS, react-router,
react-redux). Talks to the botmarket-backend over `/api` (SSE for the three agent chats,
WebSocket for social chat). Users chat with the Trade / Portfolio / Scanner agents to produce
monitored trade ideas, confirm broker orders, and run a paper (simulation) mode. The backend
repo (botmarket-backend) holds the domain spec — see its README.md / APP_SPEC.md / CODE_MAP.md.

# Rules
- Follow existing patterns: components in `src/cmps/`, routed views in `src/pages/`, logic in
  `src/customHooks/`, API calls in `src/services/<x>/<x>.service.remote.js` (never `fetch` directly
  in a component — go through `httpService`).
- Obey the Rules of Hooks: hooks are unconditional and top-level, same order every render. Changing
  a hook's count/order breaks Fast Refresh and remounts.
- SCSS uses BEM-ish names: `.cmp__element--modifier`; styles live in `src/assets/styles/cmps/` or
  beside the component. Prefer CSS variables (`var(--...)`) over hardcoded colors.
- Don't fire authed API calls while logged out — gate on `user` (an early 401 triggers the
  httpService redirect loop; see RootCmp).
- Cross-tree state changes that don't share a context use a `window` CustomEvent (e.g.
  `paper-mode-changed`); dispatch on the source, listen in the consuming hook.
- `npm run build` writes into `../botmarket-backend/public/`. If you build to typecheck and aren't
  deploying, discard those artifacts from the backend repo afterward.
- There is no test framework here yet. If asked to "write tests," flag that a runner needs setting
  up first (propose Vitest + React Testing Library) rather than assuming one exists.

# Inner QA Loop (run after every implementation)
After producing any code, before considering the task done, check:
1. Does this match existing patterns in the codebase?
2. Does this introduce an unnecessary dependency?
3. Is this more complex than it needs to be — can it be simpler?
4. What existing functionality could this break?
5. Is error handling consistent with the rest of the app?
6. Are there any shared state or side effects that weren't accounted for?

If any of these raise a concern, flag it to the user before moving on.
Do not silently proceed if something feels inconsistent.

# Bug Hunt (run after every new feature)
After implementing a feature, switch to bug-hunting mode:
1. Re-read the code you just wrote as if you didn't write it
2. Look for:
   - Logic errors — does the code actually do what it claims?
   - Edge cases — null/undefined, empty arrays, 0, negative numbers
   - Async issues — race conditions, unhandled promises, missing await
   - React pitfalls — Rules of Hooks, missing/incorrect effect deps, stale closures,
     unstable keys, state updates on unmounted components
   - State mutations — anything modified that shouldn't be (props, Redux state)
   - Error paths — what happens when a request fails, not just when it succeeds
   - Security — unsanitized input rendered, exposed sensitive data, missing auth gating
3. Write a short report: what you found, severity (high/medium/low), suggested fix
4. Ask me before applying any fix

# Conflict Check (run after every new feature)
After the bug hunt, check how the new feature interacts with the rest of the app:
1. Does it touch any shared state, context, Redux store, or global variables?
2. Does it call or modify any hooks/components/services used elsewhere?
3. Does it affect any existing routes, API calls, or data shapes?
4. Could it change behavior other components rely on?

Flag any conflicts found before moving on. Do not silently proceed.

# Docs
- Backend architecture / behavioral spec: ../botmarket-backend/README.md, APP_SPEC.md, CODE_MAP.md
