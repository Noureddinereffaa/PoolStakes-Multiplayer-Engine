# Multiplayer 8-Ball Pool

Full-stack real-time 8-ball pool game with WebSocket multiplayer, AI opponents, provably fair escrow, and cross-platform mobile support.

## Quick Start

```bash
npm install
# Copy .env.example to .env and fill in values
npm run dev        # Client + server with hot reload
npm test           # Run test suite (53 tests)
npm run build      # Production build
```

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, Canvas (game rendering) |
| **Backend** | Express, WebSocket (ws), TypeScript |
| **Database** | PostgreSQL + Prisma ORM |
| **Auth** | JWT (jsonwebtoken) |
| **Physics** | Custom 2D physics engine (48 substep, spin, friction, pockets) |
| **AI** | Built-in bot with easy/medium/hard difficulty levels |
| **Infra** | Node.js, esbuild (server bundling) |

## Architecture

```
Client (React) ←→ WebSocket ←→ Express Server
                                  ├── PvP Game Actions (gameActions.ts)
                                  ├── AI Match Manager (aiMatchManager.ts)
                                  ├── Turn Timer (turnTimer.ts)
                                  ├── Physics Engine (physics.ts)
                                  ├── Matching Queue (matchingQueue.ts)
                                  └── Prisma ORM → PostgreSQL
```

- **PvP matches**: Full escrow flow with DB persistence, race-condition-safe via `withRoomLock` (per-room async queue)
- **AI matches**: Fully isolated in-memory (`aiMatchManager.ts`), zero database calls, zero escrow
- **Physics**: Custom 2D engine with ball spin, cushion bounces, pocket detection, and frame capture for animation

## Project Structure

```
src/
├── server/                     # Backend (Node.js)
│   ├── websocket.ts            # WebSocket server (rate limit, heartbeat, routing)
│   ├── messageRouter.ts        # Message dispatch (AI vs PvP routing)
│   ├── state.ts                # Server state (rooms, locks, broadcasts, cleanup)
│   ├── gameActions.ts          # PvP handlers (join, shoot, reconnect, disconnect)
│   ├── gameLogic.ts            # Game rules, AI target selection, match conclusion
│   ├── aiMatchManager.ts       # Isolated AI match storage & handlers
│   ├── physics.ts              # Physics engine (collisions, spin, pockets)
│   ├── turnTimer.ts            # 60-second shot clock
│   ├── room.ts                 # Room/escrow logic with Prisma
│   ├── db.ts                   # Prisma client
│   ├── persist.ts              # Room snapshot persistence
│   ├── logger.ts               # Structured logging
│   ├── push.ts                 # Web Push notifications
│   └── services/
│       ├── matchingQueue.ts    # Per-stake matching queue
│       └── roomManager.ts      # Room join/create logic
├── components/                 # React components
│   ├── ArenaPage.tsx           # Main game screen
│   ├── PoolTable.tsx           # Canvas pool table (pointer events, rendering)
│   ├── HomePage.tsx            # Landing page
│   └── ...
├── hooks/
│   ├── useBilliardsSocket.ts   # WebSocket client hook
│   └── useBilliardsRenderer.ts # Canvas rendering loop
├── utils/
│   ├── mobile.ts               # Fullscreen, wake lock, chrome hiding
│   └── audio.ts                # Sound effects
└── types.ts                    # Shared TypeScript types
```

## Game Flow (PvP)

1. **Auth** → JWT token via login/register
2. **Create/Join room** → stake-based escrow locked in DB
3. **Match** → sides assigned (solids/stripes), playing state
4. **Turn loop**:
   - Preview aim → broadcast to opponent
   - Shoot → physics simulation (48 substeps/frame)
   - Frames broadcast → `evaluateShotRules()` → foul detection
   - 60s shot clock → ball-in-hand on timeout
5. **Win** → 8-ball pocketed → `concludeMatch()` → escrow payout (95/5 split)

## Game Flow (AI)

1. Select difficulty → `start_ai_match` message
2. AI match created in-memory (no DB)
3. Same physics and rendering as PvP
4. AI uses `triggerAiShot()` with humanized delays and errors
5. No escrow, no commission, no persistence

## Reconnection System

- 30-second disconnect timeout before forfeit
- Timer pauses when disconnected player is on turn
- Both-disconnected: match voided after deadline
- Forfeit timer uses `withRoomLock` to prevent race conditions
- `isReconnecting` UI overlay on client
- Player `isConnected` flag updated immediately on disconnect/reconnect

## Environment Variables

```env
# Required
JWT_SECRET=your-secret-min-32-chars
DATABASE_URL=postgresql://...

# Database (pick one)
DATABASE_PROVIDER=postgresql

# Optional
PORT=3000
HOST=0.0.0.0
VITE_HMR_PORT=24678
VITE_SENTRY_DSN=...
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server (client + server) |
| `npm run build` | Build client + bundle server |
| `npm test` | Run all tests (vitest) |
| `npm run lint` | TypeScript type check |
| `npm run start` | Start production server |
| `npx prisma migrate dev` | Apply DB migrations |
| `npx prisma studio` | Open DB browser |

## Testing

- **53 tests** across 4 files:
  - `physics.test.ts` (23) — collision, spin, pocket physics
  - `gameLogic.test.ts` (8) — shot evaluation, fouls, match flow
  - `ai.test.ts` (12) — AI target selection, difficulty levels
  - `integration.test.ts` (10) — full PvP + AI match scenarios

## Mobile Support

- **Drag-rotation aiming**: Touch + drag to rotate cue (not affected by touch position)
- **Power buttons**: Two bottom-edge drag-to-power, release-to-shoot buttons
- **Auto fullscreen**: On mount + gesture handler for browser chrome hiding
- **Wake lock**: Prevents screen sleep during play
- **PWA**: Service worker with skip-waiting, install prompt
- **Landscape lock**: Orientation request on game start

## Security

- JWT auth with 32-char minimum secret
- Rate limiting (30 msg/s per connection)
- Heartbeat (30s interval, 10s timeout)
- Helmet CSP headers
- XSS input sanitization
- `withRoomLock` per-room async mutex (no dropped operations)
- Per-stake matching queue (no global lock contention)
- Current-turn validation on all aim/shoot operations
