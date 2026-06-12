# Server Architecture Redesign — Multiplayer 8 Ball Pool

## 1. System Audit

### Current Architecture

```
┌─────────────────────────────────────────────────────────┐
│  server.ts (entry)                                      │
│  ┌──────────────────────────────────────────────────┐   │
│  │ restoreRoomSnapshots() ← ALL rooms at startup    │   │
│  │   → activeRooms Map (82 rooms × ~5KB each)       │   │
│  │   → all physics/timers resume immediately         │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ startSnapshotInterval() ← every 10s              │   │
│  │   → iterates all activeRooms                     │   │
│  │   → enqueuePersist() for each playing/waiting    │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ startTurnTimer() ← every 1s                      │   │
│  │   → iterates all activeRooms                     │   │
│  │   → decrements turnTimer, checks idle            │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ activeRooms = Map<string, RoomState>             │   │
│  │   → only 4 statuses: waiting/ready/playing/gameover│ │
│  │   → no PAUSED/ARCHIVED states                    │   │
│  │   → no memory limit                              │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Critical Problems Found

| # | Problem | Severity | Location |
|---|---------|----------|----------|
| 1 | **Bulk restore at startup** — all rooms loaded synchronously before server.listen() | 🔴 Critical | `server.ts:166` |
| 2 | **Full snapshot every 10s** — ALL rooms serialized/upserted every 10s even if idle | 🟡 High | `persist.ts:195-201` |
| 3 | **Physics runs on restored rooms** — animation timeouts, turn timers fire immediately | 🔴 Critical | `turnTimer.ts:22-77` |
| 4 | **No PAUSED state** — rooms with 0 clients still consume CPU/timers | 🔴 Critical | `state.ts:7` |
| 5 | **No ARCHIVED state** — rooms removed directly from memory, no graceful transition | 🟡 High | `state.ts:290-321` |
| 6 | **Room with disconnected players loops forever** — if both DC, physics still runs | 🟡 Medium | `turnTimer.ts:38-76` |
| 7 | **Snapshot queue drops at 50** — rooms silently not persisted during overload | 🟡 Medium | `persist.ts:55,78` |
| 8 | **No memory cap** — 1000 rooms = ~500MB+ with no guard | 🟡 Medium | `activeRooms` Map |
| 9 | **Idle cleanup only for waiting** — playing rooms with no clients never cleaned | 🟡 High | `state.ts:328-342` |
| 10 | **Serialization includes balls velocities** — storing vx/vy/physics snapshot that's stale | Low | `persist.ts:13-19` |

### Root Cause Analysis

**Root Cause #1: Monolithic restore** — `restoreRoomSnapshots()` loads ALL matching rooms into memory because the system has no lazy-load mechanism. Designed for a small number of rooms, it doesn't scale.

**Root Cause #2: Missing lifecycle states** — The 4-state model (waiting/ready/playing/gameover) lacks PAUSED and ARCHIVED. Once a room is in memory, it stays forever until manually cleaned.

**Root Cause #3: Timer iteration over all rooms** — `turnTimer.ts:22` uses `activeRooms.forEach()` every second. With 82 restored rooms, each tick does 82 lookups + state checks + potential DB writes even when no clients are connected.

**Root Cause #4: No disconnect→pause mapping** — When both players disconnect, the room continues running timers and physics simulation. The `disconnectedPlayerIds` is checked but the room itself is never paused.

---

## 2. New Architecture Design

### Room Lifecycle State Machine

```
┌──────────┐    create     ┌──────────┐
│ CREATED  │──────────────→│ WAITING  │
└──────────┘               └────┬─────┘
                                │ 2 players join
                                ↓
┌──────────┐    last client    ┌──────────┐
│ PAUSED   │←────────────────│ PLAYING  │
└────┬─────┘   disconnect      └────┬─────┘
     │                               │ shot complete
     │ client                        │ or gameover
     │ reconnects                    ↓
     │    ┌──────────┐    all shots  ┌──────────┐
     └───→│ PLAYING  │←─── done ───│ FINISHED │
          └──────────┘              └────┬─────┘
                                          │ after TTL (30 min)
                                          ↓
                                     ┌──────────┐
                                     │ ARCHIVED │ → removed from DB + memory
                                     └──────────┘
```

### New States

| State | Description | Timers | Persistence | Memory |
|-------|-------------|--------|-------------|--------|
| `CREATED` | Room record in DB, NOT in memory | None | DB only | None |
| `WAITING` | In memory, waiting for players | Idle cleanup (5min) | Every 10s | Full |
| `PLAYING` | Active match | Turn timer (1s) | Every 10s | Full |
| `PAUSED` | No connected clients, state preserved | Only cleanup (60s) | Every 30s | Full → Partial |
| `FINISHED` | Game over, awaiting rematch/cleanup | Cleanup (5min no clients) | Every 60s | Full |
| `ARCHIVED` | Removed from memory, DB ready to delete | Deletion (immediate) | Deleted | None |

### Snapshot Strategy

**What to persist:**
- Room metadata (ID, name, stake, status, code, players)
- Ball positions + pocketed state (NOT velocities — those are zero at rest)
- Turn state (currentTurn, assignedSides, scratchOccurred, etc.)
- Turn timer value
- Log (last 30 entries)
- Lifecycle metadata (lastActiveAt, state)

**What NOT to persist:**
- Ball velocities (vx, vy) — always zero at snapshot points
- Spin values (spinX, spinY) — decayed to zero
- Socket connections — ephemeral
- Animation timeouts — ephemeral

**When to persist:**
- `PLAYING` + connected clients → every 10s
- `PAUSED` + no clients → every 60s (throttled)
- `FINISHED` → once on transition
- On graceful shutdown → all non-ARCHIVED rooms

### New Restore Strategy

**Startup flow (lazy load):**

```
1. Connect to DB
2. Query: SELECT roomId, status, updatedAt FROM RoomSnapshot 
   WHERE status IN ('waiting','playing','ready','gameover')
   AND updatedAt > NOW() - 1 hour
3. Store results in roomIndex Map<roomId, RoomMeta> (lightweight, ~50 bytes each)
4. Log: "Found 82 room(s) available for lazy restoration"
5. Start server (listen)

Lazy load triggered by:
  - Client reconnect → lookup playerId in roomIndex → loadRoom(roomId)
  - Join room by code → loadRoom(roomId)
  - Any operation referencing roomId → loadRoom(roomId) if not in activeRooms
```

---

## 3. Implementation

### 3.1 Types Changes

Add PAUSED and ARCHIVED to RoomState.status + lifecycle metadata.
