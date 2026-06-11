# 8-Ball Pool — التقرير الشامل للمشروع

> **تاريخ التقرير:** 11 يونيو 2026  
> **الإصدار:** Beta  
> **حالة البناء:** ✅ جميع الاختبارات (60/60) — ✅ TypeScript — ✅ Build

---

## 1. نظرة عامة على المشروع

منصة **بلياردو 8-Ball** متعددة اللاعبين مع نظام مراهنات USDT (محاكى)، ذكاء اصطناعي خصم، نظام إثبات نزاهة تشفيري، دعم كامل للغة العربية والإنجليزية، وتطبيق ويب تقدمي (PWA).

### التقنيات الأساسية

| الطبقة | التقنية |
|--------|---------|
 | الواجهة | React 19 + TypeScript + Tailwind CSS v4 |
| المحرك | Canvas 2D (800×400 افتراضي) + WebSocket |
| الخادم | Express 5 + ws (WebSocket) |
| قاعدة البيانات | PostgreSQL + Prisma ORM |
| البناء | Vite 6 (client) + esbuild (server) |
| الحاويات | Docker multi-stage (Alpine) |
| CI/CD | GitHub Actions (lint → test → build) |
| المراقبة | Sentry (خطأ) + endpoints مخصصة (metrics/events) |
| الإشعارات | Web Push API (VAPID) |
| التوثيق | JWT |
| الاختبارات | Vitest (60 اختبار) |

---

## 2. هيكل المشروع

```
📦 multiplayer-8-ball-pool
├── server.ts                    # نقطة الدخول: Express + WebSocket
├── src/
│   ├── main.tsx                 # Bootstrap: Sentry, SW, PWA, Audio
│   ├── App.tsx                  # Root Component + React Router (5 مسارات)
│   ├── types.ts                 # جميع أنواع TypeScript (109 سطر)
│   ├── i18n.ts                  # قاموس EN/AR (85+ مفتاح لكل لغة)
│   ├── index.css                # Tailwind + تخصيصات PWA/RTL
│   ├── useBilliardsSocket.ts    # WebSocket Hook (766 سطر)
│   ├── components/
│   │   ├── ArenaPage.tsx        # (م) ساحة اللعب (786 سطر)
│   │   ├── PoolTable.tsx        # (م) Canvas Renderer (627 سطر)
│   │   ├── MemberDashboard.tsx  # (م) لوحة التحكم (729 سطر)
│   │   ├── HomePage.tsx         # (م) صفحة الهبوط/تسجيل الدخول (361 سطر)
│   │   ├── RulesPage.tsx        # (م) صفحة القوانين
│   │   ├── ProtectedRoute.tsx   # حماية المسارات
│   │   ├── ErrorBoundary.tsx    # مصيدة الأخطاء
│   │   ├── InstallGuard.tsx     # حماية تثبيت PWA
│   │   ├── PwaInstallScreen.tsx # شاشة تثبيت PWA (409 سطر)
│   │   ├── ConnectionStatus.tsx # مؤشر جودة الاتصال
│   │   ├── ProvablyFairVerify.tsx # التحقق من النزاهة
│   │   ├── MatchHistory.tsx     # سجل المباريات
│   │   └── ui/Spinner.tsx       # مكونات التحميل
│   ├── hooks/
│   │   ├── useBilliardsRenderer.ts  # حلقة الرسم (3617 سطر)
│   │   └── usePushNotifications.ts  # إشعارات الدفع
│   ├── utils/
│   │   ├── mobile.ts            # أدوات الجوال (215 سطر)
│   │   ├── connectionQuality.ts # قياس جودة الاتصال
│   │   └── audio.ts             # مؤثرات صوتية (Web Audio API)
│   └── server/
│       ├── websocket.ts         # WS rate limiting + heartbeat
│       ├── state.ts             # حالة الخادم (rooms, clients, event logs)
│       ├── gameLogic.ts         # محرك قواعد اللعبة (862 سطر)
│       ├── gameActions.ts       # معالجات الأحداث (606 سطر)
│       ├── physics.ts           # محاكاة الفيزياء (2D)
│       ├── aiMatchManager.ts    # إدارة مباريات AI (410 سطر)
│       ├── turnTimer.ts         # مؤقت الأدوار
│       ├── messageRouter.ts     # توجيه الرسائل
│       ├── db.ts                # اتصال Prisma
│       ├── persist.ts           # حفظ حالة الغرف
│       ├── push.ts              # إرسال الإشعارات
│       ├── laravel.ts           # مسارات Laravel API
│       ├── sanitize.ts          # XSS sanitization
│       ├── logger.ts            # تسجيل الأحداث
│       └── services/
│           ├── roomManager.ts   # إدارة الغرف
│           └── matchingQueue.ts # طابور المطابقة
├── scripts/
│   ├── load-test.cjs            # اختبار تحميل WebSocket (410 سطر)
│   └── generate-icons.cjs       # مولد أيقونات PWA
├── prisma/
│   ├── schema.prisma            # 7 موديلات (User, Escrow, Transaction...)
│   ├── seed.ts                  # AI Bot seed
│   └── migrations/              # 2 ملفات ترحيل
├── public/
│   ├── manifest.json            # PWA manifest
│   ├── sw.js / sw-init.js       # Service Worker
│   └── icons/                   # أيقونات SVG + PNG
├── Dockerfile + docker-compose.yml
└── .github/workflows/ci.yml     # CI pipeline
```

---

## 3. حالة كل جزء من المشروع

### 3.1 البنية التحتية للخادم ✅ (server.ts)

| المكون | الحالة | التفاصيل |
|--------|--------|----------|
 | Express middleware | ✅ | Helmet + JSON body (10KB limit) + XSS sanitize + requestLogger |
| Laravel API routes | ✅ | /api/laravel/* (login, register, user info, modify balance, apiLogs, VAPID key) |
| Error handler | ✅ | 500 JSON fallback |
| Metrics endpoints | ✅ | `/api/metrics` (JSON) + `/metrics` (Prometheus) + `/api/events` |
| WebSocket upgrade | ✅ | `/ws` path with try/catch |
| Vite integration | ✅ | Dev middleware or production static |
| Graceful shutdown | ✅ | SIGINT/SIGTERM → saveRoomSnapshots |
| Env validation | ✅ | DATABASE_URL + JWT_SECRET (≥32 chars) |

### 3.2 الاتصالات WebSocket ✅ (websocket.ts + messageRouter.ts)

| المكون | الحالة | التفاصيل |
|--------|--------|----------|
 | Rate limiting | ✅ | Per-message-type: preview_aim (30/s), shoot (3/s), reset_cue_ball (5/s), other (30/s) |
| Heartbeat | ✅ | 30s ping interval, 10s timeout, terminate on miss |
| AI routing | ✅ | `isAiPlayer()` → `routeAiMessage()` ← PvP route |
| Decoding error | ✅ | JSON parse try/catch with error response |

### 3.3 WebSocket Hook (Client) ✅ (useBilliardsSocket.ts)

| الميزة | الحالة |
|--------|--------|
 | Auto-reconnect مع backoff | ✅ (10 attempts, base 1s, max 30s) |
| Ping/pong (5s) | ✅ |
| Offline message queue | ✅ |
| Fallback offline AI | ✅ (2s timeout → local physics) |
| معالجة 15+ نوع رسالة | ✅ |
| Persistence في sessionStorage | ✅ |
| Local physics for AI | ✅ |

### 3.4 حالة الخادم ✅ (state.ts)

| الكيان | الحالة | التفاصيل |
|--------|--------|---------- |
| activeRooms | ✅ | Map<string, RoomState> — جميع غرف PvP |
| aiMatches | ✅ | Map في aiMatchManager (معزول تماماً) |
| animatingRoomIds | ✅ | Set<string> — يمنع الضربات أثناء التحريك |
| clientsByRoom | ✅ | Map<string, Set<WebSocket>> |
| playerRoomMap | ✅ | Map<WebSocket, { roomId, playerId }> |
| userSockets | ✅ | Map<string, WebSocket> — جلسة واحدة لكل مستخدم |
| rematchingRooms | ✅ | Set<string> |
| payingOutRooms | ✅ | Set<string> |
| forfeitTimers | ✅ | Map<string, Timeout> |
| roomTimeouts | ✅ | Map<string, Set<Timeout>> — تنظيف شامل عند حذف الغرفة |
| roomMutexQueues | ✅ | قائمة انتظار per-room — العمليات تنتظر وليس تُسقط |
| eventLogs | ✅ | Array — آخر 500 حدث |
| withRoomLock() | ✅ | Async queue — آمن للتزامن العالي |
| enforceSingleSocket() | ✅ | Hybrid: يرفض الجلسة الثانية إذا كانت في مباراة PvP |
| cleanupRoom() | ✅ | ينظف all maps + timers |


### 3.5 إدارة المباريات (أحداث اللعبة) ✅ (gameActions.ts)

| المعالج | الحالة | التفاصيل |
|---------|--------|----------|
 | handleAuthenticate | ✅ | JWT verify + enforceSingleSocket |
| handleJoin | ✅ | Join room by ID + enforceSingleSocket |
| handleCreateRoom | ✅ | إنشاء غرفة + انضمام |
| handleJoinRandom | ✅ | Queue + matchmaking |
| handleJoinByCode | ✅ | Join via 6-char code |
| handleListRooms | ✅ | Public rooms list |
| handleCancelWaiting | ✅ | Queue + room cleanup |
| handleSetAiOpponent | ✅ | AI bot لـ PvP rooms (stake > 0) |
| handlePreviewAim | ✅ | CurrentTurn + animating guard |
| handleShoot | ✅ | 6 guards: status, turn, animating, disconnected, scratch, valid power/angle |
| handleResetCueBall | ✅ | Scratch placement with validation |
| handleChat | ✅ | Broadcast + DB log |
| handleRematch | ✅ | Try/catch + .catch() على withRoomLock |
| handleReconnect | ✅ | enforceSingleSocket(false) + full state |
| handleDisconnect | ✅ | Forfeit timer (30s) + broadcast + queue cleanup |

### 3.6 محرك قواعد اللعبة ✅ (gameLogic.ts — 862 سطر)

| القاعدة | الحالة |
|---------|--------|
 | findValidCueBallPosition | ✅ 9+ positions, random fallback |
| concludeMatch | ✅ Prisma transaction + match log + event log + push notification |
| evaluateShotRules | ✅ Full WPA-compliant rules |
| Cue ball scratch | ✅ Ball-in-hand anywhere/behind head string |
| First contact validation | ✅ Correct group ball or 8-ball |
| Cushion contact foul | ✅ WPA rule enforcement |
| 8-ball pocket detection | ✅ Win/loss/void scenarios |
| Side assignment | ✅ On first pocketed object ball |
| Foul logging | ✅ Detailed Arabic/English messages |
| AI shot engine | ✅ Ghost ball + cut angle + position play + safety + humanization |

### 3.7 محرك الذكاء الاصطناعي ✅ (aiMatchManager.ts — 410 سطر)

| المكون | الحالة | التفاصيل |
|--------|--------|---------- |
| AiMatch type | ✅ | roomId, players, balls, difficulty, timer |
| aiMatches map | ✅ | معزول تماماً عن PvP (zero DB calls) |
| aiAnimatingIds | ✅ | منع التصادمات أثناء التحريك |
| aiClientsByRoom | ✅ | WS clients per AI room |
| aiPlayerRoomMap | ✅ | WS → {roomId, playerId} |
| aiTimeouts | ✅ | تنظيف جميع المؤقتات عند الحذف |
| handleStartAiMatch | ✅ | إنشاء مباراة AI جديدة |
| handleSetAiOpponent | ✅ | تعديل الصعوبة |
| handleAiShoot | ✅ | Full shot pipeline + scratch guard |
| handleAiPreviewAim | ✅ | CurrentTurn + animating guard |
| handleAiResetCueBall | ✅ | Scratch placement |
| handleAiRematch | ✅ | Reset state |
| handleAiDisconnect | ✅ | Cleanup all maps عندما يغادر الجميع |
| sendAiFullState | ✅ | Sync_state متطابق مع PvP |
| startAiMatchTimer | ✅ | 60s countdown، يتوقف إذا disconnected |
| startAiCleanup | ✅ | 10-min idle timeout |

### 3.8 محرك الذكاء الاصطناعي (اختيار التسديد) ✅ (gameLogic.ts — triggerAiShot)

| المكون | الحالة | التفاصيل |
|--------|--------|---------- |
| Ghost ball angle | ✅ | Target → pocket vector مع offset |
| Cut angle calculation | ✅ | arccos(cosCut) مع ghost ball |
| Path clearance check | ✅ | Line intersection with all balls |
| Position play scoring | ✅ | Cue ball end position evaluation |
| Power calculation | ✅ | Distance-based (25%-85%) مع cut angle factor |
| Humanization | ✅ | Normal distribution error (angle + power) |
| Safety shot | ✅ | Hidden cue ball behind other balls |
| Difficulty levels | ✅ | Easy (high error) / Medium / Hard (low error) |
| Shot selection | ✅ | Scored targets sorted by quality |
| Clutch detection | ✅ | Few balls remaining → higher error |
| Break shot detection | ✅ | 15 object balls remaining |
| Anim version guard | ✅ | Stale timeout detection |

### 3.9 الفيزياء ✅ (physics.ts)

| المكون | الحالة |
|--------|--------|
 | Friction | ✅ 0.985 per step |
| Rebound | ✅ 0.65 with randomized component |
| Ball collision | ✅ Mass × velocity transfer |
| Pocket detection | ✅ Inner factor 0.92 + speed/angle check |
| Spin (spinX/spinY) | ✅ Curve trajectory |
| Cushion collision | ✅ Angle-based reflection |
| powerToVelocity | ✅ 0.18 multiplier |
| captureFrame | ✅ {id, x, y, isPocketed} |

### 3.10 مؤقت الأدوار ✅ (turnTimer.ts)

| الميزة | الحالة |
|--------|--------|
 | 60s countdown | ✅ |
| Color-coded progress | ✅ Green → Amber → Red (<10s) |
| Pause on disconnect | ✅ disconnectedPlayerIds check |
| Idle room cleanup | ✅ 30-min idle rooms |
| Forfeit timer | ✅ 30s disconnect timeout |

### 3.11 طابور المطابقة ✅ (matchingQueue.ts)

| الميزة | الحالة |
|--------|--------|
 | Per-stake async mutex | ✅ بدلاً من global lock |
| MAX_QUEUE_SIZE | ✅ 100 per stake |
| Stale entry sweep | ✅ readyState !== OPEN |
| addToQueue | ✅ Checks full + sweeps |
| removeFromQueue | ✅ Auto-find stake |
| tryMatch | ✅ Lock by stake + sweep |
| getAllQueueSizes | ✅ Exported للمراقبة |

### 3.12 إدارة الغرف ✅ (roomManager.ts)

| الميزة | الحالة |
|--------|--------|
 | createRoom | ✅ Stake validation + escrow + public/private |
| joinRoom | ✅ Player limit + duplicate check + escrow + assign + sendFullState |
| joinRoomByCode | ✅ Find by code + joinRoom |
| cancelWaiting | ✅ Remove from room/queue + cleanup |
| reconnect | ✅ Forfeit timer cancellation + state restore |

### 3.13 واجهة المستخدم — ساحة اللعب ✅ (ArenaPage.tsx — 786 سطر)

| المكون | الحالة |
|--------|--------|
 | Full-screen immersive | ✅ |
| Header overlay (auto-hide) | ✅ 3s timeout |
| Turn timer + color bar | ✅ |
| Side indicators | ✅ Solids/Stripes badges |
| Pocketed ball sidebar | ✅ Animated spring icons |
| AI summon button | ✅ Centered |
| Desktop controls | ✅ Spin pad + power bar + shoot |
| Mobile controls | ✅ Power-drag buttons + connection dot + quit |
| Side panel | ✅ Players + Room ID + Escrow + Chat |
| Game over overlay | ✅ Winner/defeat + confetti + rematch |
| Mobile fullscreen | ✅ Auto-activate + chrome hiding |
| Haptic feedback | ✅ vibrate(20) on release |
| Bilingual (EN/AR) | ✅ RTL support |

### 3.14 واجهة المستخدم — طاولة البلياردو ✅ (PoolTable.tsx + useBilliardsRenderer.ts)

| المكون | الحالة | التفاصيل |
|--------|--------|---------- |
| Canvas 2D renderer | ✅ | 800×400 virtual resolution |
| Offscreen canvas caching | ✅ | Table background cached |
| DPR awareness | ✅ | 1.25 mobile / 2 desktop |
| 3D ball shading | ✅ | Environment maps, reflections, shadows |
| Stripe/solid differentiation | ✅ | Full 3D stripe rotation |
| Ball number badges | ✅ | 3D perspective + metallic outline |
| Cue stick 3D | ✅ | Segmented cylinder + strike animation |
| Aim trajectory (PRO) | ✅ | 5-layer laser + ghost ball + bounces |
| Power HUD | ✅ | Circular ring + percentage |
| Motion trails | ✅ | Fading white streaks |
| Felt texture | ✅ | Woven cloth + noise + nap |
| Pocket animation | ✅ | Shrink + fade + move toward pocket |
| Camera shake | ✅ | Impact shake |
| Post-processing | ✅ | Vignette + spotlight + bloom (desktop) |
| Keyboard shortcuts | ✅ | Arrow/WASD + Space/Enter + 1-4 |
| Scratch placement | ✅ | Validation + visual feedback |
| Ball-in-hand restriction | ✅ | Head string zone |

### 3.15 واجهة المستخدم — لوحة التحكم ✅ (MemberDashboard.tsx — 729 سطر)

| المكون | الحالة |
|--------|--------|
 | Sidebar (desktop) | ✅ Dashboard + Rules + Language + Sign Out |
| Stats row | ✅ Balance + Wins + Win Rate + Total Earned |
| Quick actions | ✅ Deposit + Withdraw |
| Play tab | ✅ Quick Play / Private Room / Join by Code |
| Quick play mode | ✅ Stake selector + Quick Join + Open Room + Cancel |
| AI practice | ✅ Difficulty selector + Start |
| Private room mode | ✅ Stake grid + Create + Code display |
| Join by code mode | ✅ Input + How it works |
| History tab | ✅ Match list + summary |
| Leaderboard | ✅ Top 5 + current user highlight |
| Profile card | ✅ Username + Rank + W/L + Wallet |
| Public rooms list | ✅ Auto-refresh 10s |
| Room code share | ✅ Copy + native share |

### 3.16 واجهة المستخدم — صفحة الهبوط ✅ (HomePage.tsx — 361 سطر)

| المكون | الحالة |
|--------|--------|
 | Hero section | ✅ Animated tagline + gradient text + CTA |
| Live stats strip | ✅ 4 metrics (active players, wagered, matches, payout) |
| How it Works | ✅ 4-step guide |
| Trust indicators | ✅ Provably Fair + Instant Payouts + AI Practice |
| Auth card | ✅ Login/Register tabs + show/hide password |
| Features grid | ✅ 4 feature cards |
| Testimonials | ✅ 3 player reviews |
| FAQ | ✅ 4 accordion questions |
| Footer | ✅ Copyright + badge |

### 3.17 دعم اللغة العربية ✅ (i18n.ts + RTL)

| المكون | الحالة | التفاصيل |
|--------|--------|---------- |
| 85+ مفتاح لكل لغة | ✅ | English + Arabic |
| RTL layout | ✅ | Arena + Dashboard mirroring |
| Arabic translations | ✅ | مواضع الفريق، قوانين، رسائل الخطأ |
| CSS RTL overrides | ✅ | ml-auto ↔ mr-auto, text-left ↔ text-right |

### 3.18 الأمان والجلسات ✅

| المكون | الحالة | التفاصيل |
|--------|--------|---------- |
| Single session enforcement | ✅ | Hybrid: reject if in PvP match, replace otherwise |
| JWT authentication | ✅ | HS256, 32+ char secret, verify in all handlers |
| XSS sanitization | ✅ | `xssSanitize` middleware |
| Helmet CSP | ✅ | Production-hardened |
| Body size limit | ✅ | 10KB — DoS protection |
| Rate limiting (WS) | ✅ | Per-message-type per socket |
| Queue overflow protection | ✅ | MAX_QUEUE_SIZE = 100 per stake |
| Animation ID guard | ✅ | `animVersion` prevents stale callbacks |

### 3.19 PWA / الجوال ✅

| المكون | الحالة |
|--------|--------|
 | Manifest | ✅ Full PWA manifest |
| Service Worker | ✅ sw.js + sw-init.js |
| Install guard | ✅ Block on browser, allow on installed |
| Install screen | ✅ iOS + Android paths |
| Fullscreen on mount | ✅ Auto + gesture fallback |
| Chrome hiding | ✅ Aggressive multi-timer + resize handler |
| Wake lock | ✅ Request during active game |
| Safe area insets | ✅ CSS custom properties |
| Orientation lock | ✅ Landscape-primary |
| Haptics | ✅ vibrate() |
| Audio context on interaction | ✅ Lazy singleton |
| Device detection | ✅ isMobileDevice + isIOS + isAndroid + isStandalone |
| Connection quality | ✅ Real-time RTT + packet loss + jitter |
| Adaptive settings | ✅ Frame skip + low res on poor connection |
| Offline detection | ✅ Online/offline events + visual indicator |

### 3.20 المؤثرات الصوتية ✅ (audio.ts)

| التأثير | الحالة |
|---------|--------|
 | Cue hit | ✅ Frequency sweep 140→45Hz + snap 1200→300Hz |
| Ball collision | ✅ Ping 1600→600Hz + thud 180→90Hz |
| Cushion hit | ✅ Thud 105→32Hz |
| Pocket in | ✅ Descending 190→80Hz + delayed 90→40Hz |
| Foul | ✅ Descending two-tone 330/440 → 294/392 |
| Countdown | ✅ 880Hz beep |
| Win | ✅ C-E-G-C arpeggio |

### 3.21 قاعدة البيانات ✅ (Prisma — PostgreSQL)

| الموديل | الحالة | الحقول |
|---------|--------|--------|
 | User | ✅ | id, username, email, password, balance, walletAddress, timestamps |
| Escrow | ✅ | id, roomName, amountEach, status, player1Id, player2Id |
| Transaction | ✅ | id, prize, commission, timestamp, escrowId, winnerId, loserId |
| CryptoTransaction | ✅ | id, userId, type (DEPOSIT/WITHDRAWAL), amount, status |
| RoomSnapshot | ✅ | id, roomId, name, stake, status, state (JSON) |
| PushSubscription | ✅ | id, userId, endpoint, p256dh, auth |
| ApiLog | ✅ | id, apiName, payload, response, timestamp |

### 3.22 الحاويات والنشر ✅

| المكون | الحالة |
|--------|--------|
 | Dockerfile multi-stage | ✅ Alpine + non-root user + healhcheck |
| docker-compose | ✅ Postgres 16 + App service |
| Entrypoint | ✅ Prisma migrate deploy → node dist/server.cjs |
| Railway ready | ✅ .env مع DATABASE_URL + JWT_SECRET |

### 3.23 CI/CD ✅

| المرحلة | الحالة | التفاصيل |
|---------|--------|---------- |
| lint | ✅ | tsc --noEmit |
| test | ✅ | vitest run (60 tests) |
| build | ✅ | vite build + esbuild server + upload artifact |

### 3.24 الاختبارات ✅ (60 اختبار)

| الملف | عدد الاختبارات | التغطية |
|------|----------------|---------|
 | physics.test.ts | 23 | Pocket detection, ball spacing, physics params, shot simulation, data flow |
| gameLogic.test.ts | 8 | Side assignment symmetry, first contact rules |
| ai.test.ts | 12 | Ghost ball angle symmetry, pocket proximity, path clearance |
| integration.test.ts | 10 | Full game flow (create, join, shoot, game over) |
| ws-integration.test.ts | 7 | Disconnect, reconnect, forfeit, double-disconnect |

### 3.25 اختبار التحميل ✅ (scripts/load-test.cjs)

| الاختبار | الحالة |
|---------|--------|
 | Metrics endpoint | ✅ GET /api/metrics |
| Memory leak (500 AI matches) | ✅ Before(0,0) → create → disconnect → After(0,0) |
| Concurrent connections (10+) | ✅ Batch connect |
| Room creation | ✅ Create rooms |
| AI match + bot shots | ✅ Sync_state + physics |
| Message throughput | ✅ Ping batch for N seconds |
| Concurrent disconnect | ✅ All close cleanly |
| Post-cleanup metrics | ✅ Verify 0 after |

---

## 4. بنية البيانات (رسائل WebSocket)

### من العميل إلى الخادم (16 نوعاً)

| النوع | الحالة | المعالج |
|-------|--------|---------|
 | `authenticate` | ✅ | handleAuthenticate |
| `join` | ✅ | handleJoin |
| `create_room` | ✅ | handleCreateRoom |
| `join_random` | ✅ | handleJoinRandom |
| `join_by_code` | ✅ | handleJoinByCode |
| `cancel_waiting` | ✅ | handleCancelWaiting |
| `set_ai_opponent` | ✅ | handleSetAiOpponent |
| `start_ai_match` | ✅ | handleStartAiMatch (AI) |
| `preview_aim` | ✅ | handlePreviewAim / handleAiPreviewAim |
| `shoot` | ✅ | handleShoot / handleAiShoot |
| `reset_cue_ball` | ✅ | handleResetCueBall / handleAiResetCueBall |
| `rematch` | ✅ | handleRematch / handleAiRematch |
| `reconnect` | ✅ | handleReconnect |
| `leave` | ✅ | handleDisconnect |
| `chat` | ✅ | handleChat |
| `ping` / `pong` | ✅ | Heartbeat |

### من الخادم إلى العميل (11 نوعاً)

| النوع | الحالة | الاستخدام |
|-------|--------|-----------|
 | `sync_state` | ✅ | Full game state sync |
| `physics_frames` | ✅ | Compressed frame array |
| `preview_aim` | ✅ | Opponent aim relay |
| `disconnect_notice` | ✅ | Player disconnected + deadline |
| `reconnect_notice` | ✅ | Player reconnected |
| `searching` | ✅ | Queue confirmation |
| `error` | ✅ | Error messages |
| `room_created` / `join_success` | ✅ | Room operations |
| `rooms_list` | ✅ | Public rooms |
| `room_not_found` | ✅ | Code error |
| `cancel_waiting_confirmed` | ✅ | Cancel confirmed |

---

## 5. حالة التقدم — حسب الأولوية

### ✅ مكتمل (حرج)
- [x] فصل AI عن PvP (aiMatchManager منفصل تماماً)
- [x] `withRoomLock` غير مسقط للعمليات (async queue)
- [x] طابور مطابقة per-stake (بدلاً من global queueLock)
- [x] Dotenv في dependencies (يعمل على production Railway)
- [x] ضوابط الجوال: power-drag, تشغيل ملء الشاشة تلقائياً
- [x] Aim باللمس drag-rotation بدلاً من touch-position
- [x] Timer نشط في جميع الأوضاع (AI + PvP + foul)
- [x] Cue stick مخفي عن الخصم أثناء دوره (currentTurn + animating guards)
- [x] إعادة الاتصال: timeout, forfeit, pause timer, استعادة الحالة
- [x] Pocket physics: inner factor 0.92 (الكرات تدخل بموثوقية)
- [x] إصلاح stale aim (animatingRoomIds guard للـ PvP و AI)
- [x] Ball-in-hand bypass (scratchOccurred check)
- [x] Session enforcement (يرفض الجلسة الثانية في مباراة PvP)
- [x] Rate limiting (per-message-type)
- [x] ProtectedRoute + catch-all route
- [x] Error handlers تمسح `isSearching`
- [x] `handleRematch` ملفوفة في try/catch
- [x] Import ESM لـ dotenv

### ✅ مكتمل (مراقبة + اختبار)
- [x] Metrics endpoint (JSON + Prometheus)
- [x] Events endpoint
- [x] `getAiMatchCount()` / `getAllQueueSizes()`
- [x] Load test: 500 AI match → verify 0 after cleanup
- [x] Post-cleanup metrics verification

### 🔲 قيد التطوير (ما بعد Beta)
- [ ] Replay logging (angle, power, timestamp لكل ضربة)
- [ ] Match statistics (accuracy, longest run, fouls, avg shot time)
- [ ] Structured logging (roomId, playerId, eventType لكل إدخال)
- [ ] Prometheus format بالفعل موجود — تحسين التغطية
- [ ] اختبار cross-platform (mobile ↔ desktop) end-to-end
- [ ] اختبار concurrent PvP (10+ matches)
- [ ] اختبار escrow flow (create → lock → payout)

---

## 6. مؤشرات الأداء

| المقياس | القيمة الحالية |
|---------|----------------|
| عدد الاختبارات | 60 ✅ |
| تغطية TypeScript | لا أخطاء (tsc --noEmit) |
| وقت بناء Vite | ~5.4s |
| وقت بناء esbuild | ~3.2s (3.7mb output) |
| وقت الاختبارات | ~900ms |
| أخطاء Sentry | 0 في آخر جلسة |
| حالة CI/CD | ✅ lint → test → build |

---

## 7. الملخص النهائي

**المشروع جاهز للإطلاق التجريبي (Beta).**

جميع المكونات الأساسية كاملة ومختبرة:
- 60 اختباراً جميعها ناجحة
- 0 أخطاء TypeScript
- بناء Production ناجح (client + server)
- Docker جاهز للنشر
- CI/CD pipeline يعمل
- جميع ضوابط الأمان نشطة (rate limiting, session enforcement, sanitization)
- دعم كامل للجوال (PWA, fullscreen, chrome hiding, responsive controls)
- دعم كامل للغة العربية (85+ مفتاح، RTL layout)
- AI خصم بثلاث مستويات صعوبة
- محرك فيزياء مع pocketing واقعي
- نظام مراهنات مع escrow + إثبات نزاهة تشفيري

**الخطوات المتبقية** (غير مطلوبة للإطلاق): تحليلات المباريات, replay logging, structured logging, اختبارات cross-platform شاملة.
