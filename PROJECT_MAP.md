# PROJECT MAP — Multiplayer 8-Ball Pool (Play & Win USDT)

> Generated: 2026-06-08T09:00 UTC | Role: Staff Software Engineer / Tech Lead

---

## [TECH_STACK]

| Layer       | Technology                          | Version (pinned) | Latest Stable | Status      |
|-------------|-------------------------------------|-------------------|---------------|-------------|
| Runtime     | Node.js                             | ^22.14.0 (types)  | 22.x          | ✅ Current  |
| Language    | TypeScript                          | ~5.8.2            | 5.8.2         | ✅ Current  |
| Frontend    | React + React DOM                   | ^19.0.1           | 19.2.7        | ⚠️ Minor behind |
|             | Vite                                | ^6.2.3            | 6.2.3+        | ✅ Current  |
|             | Tailwind CSS                        | ^4.1.14           | 4.3.0         | ⚠️ Minor behind |
|             | Framer Motion                       | ^12.40.0          | 12.40.0       | ✅ Current  |
|             | Lucide React Icons                  | ^0.546.0          | 0.546.0+      | ✅ Current  |
| Backend     | Express                             | ^4.21.2           | 4.21.2 (v5=5.2.1) | ⚠️ v5 available |
|             | ws (WebSocket)                      | ^8.21.0           | 8.21.0        | ✅ Current  |
| Database    | Prisma + SQLite                     | ^6.4.1            | 6.4.1 (v7=7.x)| ⚠️ v7 avail |
| Auth        | bcryptjs + jsonwebtoken             | ^3.0.3 / ^9.0.3   | latest        | ✅ Current  |
| Build       | esbuild + tsx                       | ^0.25.0 / ^4.21.0 | latest        | ✅ Current  |
| Test        | Vitest                              | ^4.1.8            | 4.1.8         | ✅ Current  |

**Infra**: Local SQLite (`dev.db`), in-memory state maps, JWT localStorage session.

---

## [SYSTEM_FLOW]

```
┌──────────────┐     HTTP/WS      ┌───────────────────┐     Prisma     ┌──────────┐
│   Browser    │ ◄─────────────►   │   Node Server     │ ◄──────────►  │  SQLite  │
│  (React SPA) │   localhost:3000  │  Express + WS     │               │  dev.db  │
│              │                   │  Authoritative    │               │          │
│  Canvas2D    │                   │  Physics Engine   │               │ Users    │
│  PoolTable   │                   │  Room State Map   │               │ Escrows  │
│  AudioSynth  │                   │  Turn Timer (1s)  │               │ Txns     │
└──────────────┘                   │  AI Bot Engine    │               │ ApiLogs  │
                                   └───────────────────┘               └──────────┘
```

### User Journey (Verifiable Goals)

```
[Landing] → Login/Register/Guest → [Dashboard] → Host Room or Join AI
                                                       ↓
                                              [Arena] PoolTable
                                              ┌─────────┬──────────┐
                                              │ Aim/Shoot│ AI Turn  │
                                              │ (WS msg) │ (auto)   │
                                              └────┬─────┴──────────┘
                                                   ↓
                                              Game Over → Escrow Payout
                                                   ↓
                                              [Dashboard] history/ledger
```

### Data Flow (Per Shot)

1. Client pointer → `handleShoot(angle, power, spinX, spinY)` → WS `shoot` msg
2. Server `handleShoot` validates turn, runs `simulatePhysicsStep` loop (up to 1200 frames)
3. Server sends compact `physics_frames` back to all room clients
4. Server calls `evaluateShotRules` → determines fouls, side assignment, match outcome
5. Server broadcasts `sync_state` with updated `RoomState`
6. Client animates frames via `requestAnimationFrame` + linear interpolation
7. If AI turn → `triggerAiShot` with timeout (600-2000ms depending on difficulty)

---

## [ARCHITECTURE]

### Directory Structure (Domain-Driven)

```
multiplayer-8-ball-pool/
├── server.ts                 # Express + WS bootstrap, Vite middleware
├── src/
│   ├── main.tsx              # React entry, HMR noise filtering
│   ├── App.tsx               # Root component: auth, routing, toast, game orchestration
│   ├── types.ts              # Shared TS interfaces (Ball, Player, RoomState, SocketMessage)
│   ├── i18n.ts               # English/Arabic dictionary (85 keys)
│   ├── useBilliardsSocket.ts # WS hook: connect, disconnect, frame decompression, offline fallback
│   ├── index.css             # Tailwind import
│   ├── server/               # 🧠 Authoritative server logic (shared imports via tsx)
│   │   ├── physics.ts        # Shared 2D physics engine (ball-ball, ball-rail, pockets, spin)
│   │   ├── gameLogic.ts      # WPA rule evaluation, AI shot decision, match conclusion
│   │   ├── gameActions.ts    # WS message handlers (join, shoot, preview, reset, chat, disconnect)
│   │   ├── messageRouter.ts  # WS message type dispatcher
│   │   ├── websocket.ts      # WS server setup, rate limiter (30 msg/s per conn)
│   │   ├── state.ts          # In-memory state: activeRooms, matchLogs, client maps
│   │   ├── room.ts           # Room ORM: ensureLaravelUser, lockRoomEscrow, createAiPlayer
│   │   ├── turnTimer.ts      # 60s shot clock, room cleanup (5min idle), API log cleanup (24h)
│   │   ├── laravel.ts        # REST API: auth, users, escrow, crypto, logs (Express routes)
│   │   ├── db.ts             # Prisma singleton (globalThis caching)
│   │   ├── gameLogic.test.ts # Vitest tests for game logic
│   │   ├── physics.test.ts   # Vitest tests for physics
│   │   └── ai.test.ts        # Vitest tests for AI
│   ├── components/           # 🎨 React components
│   │   ├── HomePage.tsx      # Landing/auth page
│   │   ├── RulesPage.tsx     # Game rules display
│   │   ├── MemberDashboard.tsx # Wallet, leaderboard, matchmaking, deposit/withdraw
│   │   ├── ArenaPage.tsx     # Live match layout (table + sidebar)
│   │   ├── PoolTable.tsx     # Main canvas component (600+ lines render loop)
│   │   ├── PoolTable/        # PoolTable sub-modules (domain cohesion)
│   │   │   ├── types.ts      # Local types
│   │   │   ├── PoolHUD.tsx   # Score/timer/spin HUD
│   │   │   ├── drawTable.ts  # Offscreen canvas table rendering
│   │   │   ├── effects.ts    # Particles, ripples, sinking animations
│   │   │   ├── rotation.ts   # 3D ball rotation tracking
│   │   │   └── usePointerInteraction.ts # Mouse/touch aiming
│   │   ├── MatchHistory.tsx  # Completed matches table
│   │   ├── ProvablyFairVerify.tsx # SHA256 verification UI
│   │   └── ErrorBoundary.tsx # React error boundary
│   └── utils/
│       └── audio.ts          # Web Audio API synthesized sounds (cue, collision, pocket, foul, win)
├── prisma/
│   └── schema.prisma         # 5 models: User, CryptoTransaction, Escrow, Transaction, ApiLog
├── vite.config.ts            # Vite config with Tailwind plugin + React plugin
├── vitest.config.ts          # Test config (globals, node env)
├── tsconfig.json             # Target ES2022, bundler resolution, path alias @/
└── package.json              # 26 deps + 11 devDeps
```

### Key Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| **Authoritative Server Physics** | All physics runs on server; client only renders frames. Prevents cheating. |
| **Shared Physics Module** | `src/server/physics.ts` imported by both server (tsx) and client (Vite). Single source of truth for ball dynamics. |
| **In-Memory State** | Rooms stored in `Map<string, RoomState>`. No DB overhead for real-time game state. Fast, simple. |
| **Compact Frame Protocol** | `[id, x, y, isPocketed]` arrays instead of objects — reduces WS payload by ~60%. |
| **Prisma Transactions** | Escrow lock/payout wrapped in `$transaction` for atomicity. |
| **WebSocket Rate Limiter** | 30 msg/s per connection — prevents DoS via rapid fire. |
| **Offline Fallback** | Client detects server timeout (1s) and enters local practice mode with same physics. |
| **AI Position Play** | Ghost ball + cut angle + position scoring + safety shot detection. Three difficulty tiers. |

---

## [ORPHANS & PENDING]

| ID | Issue | Location | Priority | Notes |
|----|-------|----------|----------|-------|
| P-01 | **Express v5 available** | `package.json` → express ^4.21.2 | Low | v5 is stable; migrate for improved async error handling |
| P-02 | **Prisma v7 available** | `package.json` → prisma ^6.4.1 | Medium | v7 has improved edge/accelerate support |
| P-03 | **No structured logging** | Throughout | High | `console.error` scattered — needs async logger (Protocol 4) |
| P-04 | **Incomplete AI tests** | `src/server/ai.test.ts` | Medium | Single test file — needs coverage for all difficulty tiers |
| P-05 | **No CI/CD config** | root | Low | No GitHub Actions, no deploy config |
| P-06 | **Hardcoded JWT_SECRET** | `.env` + `laravel.ts:8` | **Critical** | Falls back to `process.exit(1)` if default; needs env validation at startup |
| P-07 | **Guest session no persistence** | `App.tsx:252-266` | Low | Guest users created in-memory only; no DB record |
| P-08 | **No WebSocket reconnection** | `useBilliardsSocket.ts` | Medium | On WS close, state nulls out — no exponential backoff retry |
| P-09 | **Canvas rendering in single component** | `PoolTable.tsx` (1800+ lines) | Medium | Consider splitting render logic from component lifecycle |
| P-10 | **No Docker/container config** | root | Low | Useful for reproducible deploys |
| P-11 | **React version 19.0.1 vs 19.2.7** | `package.json` | Low | Minor — bump for latest hooks/optimizations |
| P-12 | **Tailwind 4.1.14 vs 4.3.0** | `package.json` | Low | Minor bump available |
| P-13 | **SQLite for production** | `prisma/schema.prisma` | Medium | SQLite is acceptable for single-server but consider PostgreSQL for scale |

---

## [MILESTONES — Verifiable Goals]

### M1: Logging & Observability (Protocol 4)
- [ ] Replace all `console.error` with async structured logger (levels: debug, info, warn, error)
- [ ] Add request/response logging middleware for Express routes
- [ ] Verify: `grep -r "console\." src/` returns ≤ 5 lines (intentional boots)

### M2: Auth & Security Hardening
- [ ] Validate `JWT_SECRET` at startup — exit with clear message if missing/default
- [ ] Add input sanitization for all user fields (XSS prevention)
- [ ] Add helmet.js or equivalent security headers
- [ ] Verify: Pen-test auth flow — no SQL injection, no JWT tampering

### M3: State Persistence & Recovery
- [ ] Implement WebSocket reconnection with exponential backoff (1s, 2s, 4s, max 30s)
- [ ] Add room state persistence to DB (periodic snapshots)
- [ ] Verify: Kill server → restart → clients reconnect → game state restored

### M4: Testing & CI
- [ ] Expand AI tests: easy/medium/hard, edge cases (all pockets, cluster breaks)
- [ ] Add integration test: player join → shoot → gameover → payout
- [ ] Add GitHub Actions workflow: lint → typecheck → test
- [ ] Verify: `npm test` passes, coverage ≥ 40%

### M5: Performance
- [ ] Profile physics engine — optimize collision detection with spatial hashing
- [ ] Add WS message batching for `sync_state` during high-frequency updates
- [ ] Verify: 1000 physics steps complete in < 50ms

### M6: Production Readiness
- [ ] Add PostgreSQL support (optional Prisma datasource switch)
- [ ] Add Dockerfile + docker-compose
- [ ] Add health check endpoint (`GET /health`)
- [ ] Verify: `docker compose up` → game fully functional

---

## [PENDING DECISIONS]

1. **Express v5 migration**: Gains native async error handling — simplifies `laravel.ts` route handlers. Cost: ~2h refactor.
2. **Prisma v7**: Better edge support but no breaking changes for SQLite. Can defer.
3. **Logging lib**: Use `pino` (fastest) or `winston` (ecosystem). Recommendation: `pino` + `pino-pretty` for dev.
4. **Canvas refactor**: `PoolTable.tsx` is 1800+ lines. Extract render pipeline into custom hook (`usePoolTableRenderer`).
5. **Guest user DB**: Currently no DB record — means no balance tracking across sessions. Consider ephemeral guest sessions with TTL.
