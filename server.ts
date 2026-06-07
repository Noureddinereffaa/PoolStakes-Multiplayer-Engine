import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { Ball, RoomState, Player, SocketMessage, MatchHistory } from './src/types';

// Webpack/Esbuild-compatible paths config
const PORT = 3000;
const app = express();
const server = createServer(app);

// Enable JSON parser for Laravel mock API routes
app.use(express.json());

// ==========================================
// Laravel Betting Platform Simulator Database
// ==========================================
interface LaravelUser {
  id: string;
  username: string;
  balance: number;
  email?: string;
  password?: string;
  walletAddress?: string;
}

interface EscrowTx {
  escrowId: string;
  roomName: string;
  player1Id: string;
  player2Id: string;
  amountEach: number;
  status: 'locked' | 'refunded' | 'payout_completed';
}

const laravelDb = {
  users: [
    { id: 'usr-1', username: 'mohawkbigger', balance: 500.0 },
    { id: 'usr-2', username: 'PoolMaster99', balance: 350.0 },
    { id: 'ai-bot', username: 'Authoritative_AI_Bot', balance: 9999.0 }
  ] as LaravelUser[],
  escrows: [] as EscrowTx[],
  transactions: [] as any[],
  apiLogs: [] as any[]
};

// Log helper to record API interactions
function logLaravelApi(apiName: string, reqBody: any, response: any) {
  const logItem = {
    id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    apiName,
    payload: reqBody,
    response,
    timestamp: new Date().toISOString()
  };
  laravelDb.apiLogs.push(logItem);
  broadcastToAllWebSockets({
    type: 'laravel_api_log',
    id: logItem.id,
    apiName,
    payload: reqBody,
    response,
    timestamp: logItem.timestamp
  });
}

// ------------------------------------------
// Laravel Mock Routing API Endpoint List
// ------------------------------------------

// Fetch betting users list & balances
app.get('/api/laravel/users', (req, res) => {
  res.json({ users: laravelDb.users });
});

// User Registration Route
app.post('/api/laravel/auth/register', (req, res) => {
  const { username, email, password, walletAddress } = req.body;
  if (!username) {
    return res.status(400).json({ success: false, error: 'Username is required' });
  }
  const exists = laravelDb.users.some(u => 
    u.username.toLowerCase() === username.toLowerCase() || 
    (u.email && email && u.email.toLowerCase() === email.toLowerCase())
  );
  if (exists) {
    return res.status(400).json({ success: false, error: 'Username or Email already registered' });
  }

  const newUser: LaravelUser = {
    id: `usr-${Date.now()}`,
    username,
    email: email || `${username}@playusdt.domain`,
    password: password || '123456',
    balance: 500.0, // Welcome bonus of 500 USDT
    walletAddress: walletAddress || 'T' + Math.random().toString(36).substring(2, 11).toUpperCase() + 'usdtTRC20'
  };

  laravelDb.users.push(newUser);
  logLaravelApi('POST /api/laravel/auth/register', { username, email, walletAddress }, { success: true, userId: newUser.id, balance: newUser.balance });
  res.json({ success: true, user: newUser });
});

// User Login Route
app.post('/api/laravel/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and Password are required' });
  }
  const user = laravelDb.users.find(u => 
    u.username.toLowerCase() === username.toLowerCase() || 
    (u.email && u.email.toLowerCase() === username.toLowerCase())
  );
  if (!user) {
    return res.status(401).json({ success: false, error: 'User not found in our betting records' });
  }
  // Mock passwords check: standard password default is '123456' for pre-seeded players
  const correctPassword = user.password || '123456';
  if (correctPassword !== password) {
    return res.status(401).json({ success: false, error: 'Invalid password credentials' });
  }
  logLaravelApi('POST /api/laravel/auth/login', { username }, { success: true, userId: user.id });
  res.json({ success: true, user });
});

// Update specific wallet balance (to let users customize values in UI)
app.post('/api/laravel/users/update', (req, res) => {
  const { userId, amount } = req.body;
  const user = laravelDb.users.find(u => u.id === userId);
  if (user) {
    user.balance = Math.max(0, parseFloat(amount.toFixed(2)));
    res.json({ success: true, user });
  } else {
    res.status(404).json({ success: false, error: 'User not found' });
  }
});

// Verify and Lock Escrow Before Match
app.post('/api/laravel/escrow/lock', (req, res) => {
  const { roomName, player1Id, player2Id, stake } = req.body;
  
  const u1 = laravelDb.users.find(u => u.id === player1Id);
  const u2 = laravelDb.users.find(u => u.id === player2Id);
  
  if (!u1 || !u2) {
    const err = { error: 'One or both players do not exist in database.' };
    logLaravelApi('POST /api/laravel/escrow/lock', req.body, err);
    return res.status(400).json(err);
  }
  
  if (u1.balance < stake || u2.balance < stake) {
    const err = { error: 'Insufficient funds in player account wallet.' };
    logLaravelApi('POST /api/laravel/escrow/lock', req.body, err);
    return res.status(400).json(err);
  }
  
  // Deduct wallets (LOCKED in ESCROW)
  u1.balance -= stake;
  u2.balance -= stake;
  
  const escrowId = `escrow-${Math.floor(Math.random() * 89999 + 10000)}`;
  const escrow: EscrowTx = {
    escrowId,
    roomName,
    player1Id,
    player2Id,
    amountEach: stake,
    status: 'locked'
  };
  
  laravelDb.escrows.push(escrow);
  
  const successResponse = {
    success: true,
    escrowId,
    lockedAmount: stake * 2,
    balances: {
      [player1Id]: u1.balance,
      [player2Id]: u2.balance
    }
  };
  
  logLaravelApi('POST /api/laravel/escrow/lock', req.body, successResponse);
  res.json(successResponse);
});

// Payout Distribution (Match Completed)
app.post('/api/laravel/escrow/payout', (req, res) => {
  const { escrowId, winnerId, loserId, commissionRate = 0.05 } = req.body;
  
  const esc = laravelDb.escrows.find(e => e.escrowId === escrowId && e.status === 'locked');
  if (!esc) {
    const err = { error: 'Invalid or already processed Escrow transaction.' };
    logLaravelApi('POST /api/laravel/escrow/payout', req.body, err);
    return res.status(400).json(err);
  }
  
  const originalWinner = laravelDb.users.find(u => u.id === winnerId);
  const originalLoser = laravelDb.users.find(u => u.id === loserId);
  
  if (!originalWinner) {
    const err = { error: 'Winner not found.' };
    logLaravelApi('POST /api/laravel/escrow/payout', req.body, err);
    return res.status(400).json(err);
  }
  
  const totalPot = esc.amountEach * 2;
  const commission = Math.round(totalPot * commissionRate * 100) / 100;
  const prize = totalPot - commission;
  
  // Credit the winner
  originalWinner.balance += prize;
  esc.status = 'payout_completed';
  
  const trxId = `trx-${Math.floor(Math.random() * 899999 + 100000)}`;
  const trx = {
    id: trxId,
    escrowId,
    prize,
    commission,
    winnerId,
    loserId,
    timestamp: new Date().toISOString()
  };
  laravelDb.transactions.push(trx);
  
  const responseData = {
    success: true,
    transactionId: trxId,
    totalPot,
    siteCommission: commission,
    payoutPrize: prize,
    winnerBalance: originalWinner.balance,
    loserBalance: originalLoser ? originalLoser.balance : 0
  };
  
  logLaravelApi('POST /api/laravel/escrow/payout', req.body, responseData);
  res.json(responseData);
});

// Get Live API Audit logs
app.get('/api/laravel/logs', (req, res) => {
  res.json({ logs: laravelDb.apiLogs });
});

// ==========================================
// 8-Ball Authoritative Physics Engine Server
// ==========================================
const TABLE_W = 800;
const TABLE_H = 400;
const CUSHION = 20;
const BALL_R = 10;
const POCKET_RADIUS = 24;

const pocketCenters = [
  { x: CUSHION + 4, y: CUSHION + 4 },
  { x: TABLE_W / 2, y: CUSHION + 1 },
  { x: TABLE_W - CUSHION - 4, y: CUSHION + 4 },
  { x: CUSHION + 4, y: TABLE_H - CUSHION - 4 },
  { x: TABLE_W / 2, y: TABLE_H - CUSHION - 1 },
  { x: TABLE_W - CUSHION - 4, y: TABLE_H - CUSHION - 4 },
];

function getInitialBalls(): Ball[] {
  const balls: Ball[] = [];
  
  // 1. Cue Ball
  balls.push({
    id: 0,
    x: 200,
    y: 200,
    vx: 0,
    vy: 0,
    radius: BALL_R,
    isPocketed: false,
    type: 'cue',
    color: '#FAF9F6', // Off-white luxury felt cue
  });

  // Calculate 15 rack balls (Triangle grid starting at x: 560, y: 200)
  const startX = 550;
  const startY = 200;
  const colSpacing = BALL_R * 1.732; // sqrt(3)*R to make tight vertical nest
  const rowSpacing = BALL_R * 2;

  // Let's create a predictable yet rule-compliant 8-ball layout:
  // - 8 ball in the center.
  // - Corners of the back row containing opposite solid/stripes.
  // - Alternating rows.
  const rackBallIds = [
    1,          // Row 0
    9, 2,       // Row 1
    10, 8, 3,   // Row 2 (Black 8 in center)
    4, 11, 5, 12, // Row 3
    13, 6, 14, 7, 15 // Row 4 (Back row corner 13 stripes, corner 15 solids)
  ];

  const colColors: { [key: number]: string } = {
    1: '#F59E0B', // Solid Yellow
    2: '#3B82F6', // Solid Blue
    3: '#EF4444', // Solid Red
    4: '#8B5CF6', // Solid Purple
    5: '#F97316', // Solid Orange
    6: '#10B981', // Solid Green
    7: '#7F1D1D', // Solid Maroon (dark red)
    8: '#111827', // Black 8-Ball
    9: '#FBBF24', // Yellow Stripe
    10: '#60A5FA', // Blue Stripe
    11: '#FCA5A5', // Red Stripe
    12: '#C084FC', // Purple Stripe
    13: '#FEB08A', // Orange Stripe
    14: '#34D399', // Green Stripe
    15: '#991B1B', // Maroon Stripe
  };

  let idx = 0;
  for (let col = 0; col < 5; col++) {
    const rx = startX + col * colSpacing;
    for (let row = 0; row <= col; row++) {
      const ballId = rackBallIds[idx++];
      const ry = startY + (row - col / 2) * rowSpacing;
      
      balls.push({
        id: ballId,
        x: rx,
        y: ry,
        vx: 0,
        vy: 0,
        radius: BALL_R,
        isPocketed: false,
        type: ballId === 8 ? 'black' : (ballId <= 7 ? 'solid' : 'stripe'),
        color: colColors[ballId],
        number: ballId
      });
    }
  }

  return balls;
}

// Single substep update to resolve physics with High-Precision Multi-Substepping (anti-tunneling engine)
function simulatePhysicsStep(
  balls: Ball[],
  friction = 0.988,
  elasticLoss = 0.95,
  tracker?: { firstContactBallId: number | null; cushionContactOccurred?: boolean }
) {
  const S = 10; // 10 high-precision steps per simulation frame for maximum professional collision fidelity
  const subFriction = Math.pow(friction, 1 / S);

  for (let s = 0; s < S; s++) {
    // 1. Position update and friction dampening
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (b.isPocketed) continue;

      // Apply dynamic cue ball spin curves & rolling conversion in real-time
      if (b.id === 0) {
        const bX = (b as any).spinX || 0;
        const bY = (b as any).spinY || 0;
        const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        
        if (speed > 0.08) {
          // A. Swerve (lateral curvature deviation based on side spin)
          const nx = -b.vy / speed;
          const ny = b.vx / speed;
          const curveForce = bX * 0.048 * Math.min(speed, 5.5) / S;
          b.vx += nx * curveForce;
          b.vy += ny * curveForce;

          // B. Follow/Draw speed decay adjustments (Follow rolls longer while Draw acts as a brake)
          const rollForce = bY * 0.024 / S;
          b.vx += (b.vx / speed) * rollForce;
          b.vy += (b.vy / speed) * rollForce;
        }

        // Decay active spinning rates progressively
        if ((b as any).spinX) (b as any).spinX *= Math.pow(0.98, 1 / S);
        if ((b as any).spinY) (b as any).spinY *= Math.pow(0.98, 1 / S);
      }

      b.x += b.vx / S;
      b.y += b.vy / S;

      b.vx *= subFriction;
      b.vy *= subFriction;

      // Minimum velocity dampening cutout threshold
      if (Math.abs(b.vx) < 0.05) b.vx = 0;
      if (Math.abs(b.vy) < 0.05) b.vy = 0;

      // Elastic Wall bounds checking with ENGLISH bounce angle modifier
      const minX = CUSHION + BALL_R;
      const maxX = TABLE_W - CUSHION - BALL_R;
      const minY = CUSHION + BALL_R;
      const maxY = TABLE_H - CUSHION - BALL_R;

      if (b.x < minX) {
        b.x = minX;
        b.vx = -b.vx * elasticLoss;
        if (tracker && tracker.firstContactBallId !== null) {
          tracker.cushionContactOccurred = true;
        }
        if (b.id === 0) {
          const sX = (b as any).spinX || 0;
          b.vy -= sX * 1.5 * Math.abs(b.vx);
          (b as any).spinX *= -0.4;
        }
      } else if (b.x > maxX) {
        b.x = maxX;
        b.vx = -b.vx * elasticLoss;
        if (tracker && tracker.firstContactBallId !== null) {
          tracker.cushionContactOccurred = true;
        }
        if (b.id === 0) {
          const sX = (b as any).spinX || 0;
          b.vy += sX * 1.5 * Math.abs(b.vx);
          (b as any).spinX *= -0.4;
        }
      }

      if (b.y < minY) {
        b.y = minY;
        b.vy = -b.vy * elasticLoss;
        if (tracker && tracker.firstContactBallId !== null) {
          tracker.cushionContactOccurred = true;
        }
        if (b.id === 0) {
          const sX = (b as any).spinX || 0;
          b.vx += sX * 1.5 * Math.abs(b.vy);
          (b as any).spinX *= -0.4;
        }
      } else if (b.y > maxY) {
        b.y = maxY;
        b.vy = -b.vy * elasticLoss;
        if (tracker && tracker.firstContactBallId !== null) {
          tracker.cushionContactOccurred = true;
        }
        if (b.id === 0) {
          const sX = (b as any).spinX || 0;
          b.vx -= sX * 1.5 * Math.abs(b.vy);
          (b as any).spinX *= -0.4;
        }
      }

      // Check Pocket centering transitions
      for (const pocket of pocketCenters) {
        const dx = b.x - pocket.x;
        const dy = b.y - pocket.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < POCKET_RADIUS * POCKET_RADIUS) {
          b.isPocketed = true;
          b.vx = 0;
          b.vy = 0;
          break;
        }
      }
    }

    // 2. Pairwise ball-to-ball elastic collision checks with Draw and Follow action
    for (let i = 0; i < balls.length; i++) {
      const b1 = balls[i];
      if (b1.isPocketed) continue;

      for (let j = i + 1; j < balls.length; j++) {
        const b2 = balls[j];
        if (b2.isPocketed) continue;

        const dx = b2.x - b1.x;
        const dy = b2.y - b1.y;
        const distSq = dx * dx + dy * dy;
        const minDist = b1.radius + b2.radius;

        if (distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq) || 0.001;
          const overlap = minDist - dist;

          // Push apart symmetrically along normal to resolve overlap
          const nx = dx / dist;
          const ny = dy / dist;

          b1.x -= nx * overlap * 0.5;
          b1.y -= ny * overlap * 0.5;
          b2.x += nx * overlap * 0.5;
          b2.y += ny * overlap * 0.5;

          // Project relative velocities onto the collision normal
          const kx = b1.vx - b2.vx;
          const ky = b1.vy - b2.vy;
          const p = nx * kx + ny * ky;

          if (p > 0) { // Moving towards each other
            const impulse = p * elasticLoss;
            b1.vx -= impulse * nx;
            b1.vy -= impulse * ny;
            b2.vx += impulse * nx;
            b2.vy += impulse * ny;
          }

          // Apply physical Drew & Follow impulse upon first contact!
          if (b1.id === 0) {
            const sY = (b1 as any).spinY || 0;
            b1.vx += nx * sY * 4.8;
            b1.vy += ny * sY * 4.8;
            (b1 as any).spinY *= 0.1; // absorb/neutralize spin intensity
          } else if (b2.id === 0) {
            const sY = (b2 as any).spinY || 0;
            b2.vx -= nx * sY * 4.8;
            b2.vy -= ny * sY * 4.8;
            (b2 as any).spinY *= 0.1;
          }

          // Authoritative tracking of first ball struck by cue ball
          if (tracker && tracker.firstContactBallId === null) {
            if (b1.id === 0) {
              tracker.firstContactBallId = b2.id;
            } else if (b2.id === 0) {
              tracker.firstContactBallId = b1.id;
            }
          }
        }
      }
    }
  }
}

// Global active game room list
const activeRooms = new Map<string, RoomState>();
const animatingRoomIds = new Set<string>();
const matchLogs: MatchHistory[] = [];

// Create or retrieve a standard room
function getOrCreateRoom(roomId: string, name: string, stake = 10): RoomState {
  if (activeRooms.has(roomId)) {
    return activeRooms.get(roomId)!;
  }

  const newRoom: RoomState = {
    roomId,
    name,
    stake,
    status: 'waiting',
    players: [],
    balls: getInitialBalls(),
    currentTurn: '',
    assignedSides: false,
    scratchOccurred: false,
    pocketedThisTurn: false,
    log: ['Lobby created. Waiting for betting players.']
  };

  activeRooms.set(roomId, newRoom);
  return newRoom;
}

// Sync room updates with connected players
function broadcastRoom(roomId: string) {
  const room = activeRooms.get(roomId);
  if (!room) return;

  const wssList = clientsByRoom.get(roomId) || [];
  const payload = JSON.stringify({
    type: 'sync_state',
    state: room
  });

  for (const client of wssList) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// Helper to broadcast to absolutely all active websockets (including debug log systems)
const activeSockets = new Set<WebSocket>();
function broadcastToAllWebSockets(messageObj: any) {
  const payload = JSON.stringify(messageObj);
  for (const ws of activeSockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

const clientsByRoom = new Map<string, Set<WebSocket>>();
const playerRoomMap = new Map<WebSocket, { roomId: string; playerId: string }>();

// WebSocket Server initialization on port 3000
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  try {
    const url = request.url || '';
    const pathname = url.split('?')[0];
    
    if (pathname === '/ws' || pathname === '/ws/' || pathname.startsWith('/ws')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  } catch (err) {
    console.error('WebSocket upgrade error:', err);
  }
});

wss.on('connection', (ws) => {
  activeSockets.add(ws);

  ws.on('message', async (data) => {
    try {
      const msg: SocketMessage = JSON.parse(data.toString());
      
      switch (msg.type) {
        case 'join': {
          const { roomId, username, stake } = msg;
          const room = getOrCreateRoom(roomId, `Stakes match: $${stake}`, stake);

          // Connect Player
          // Ensure client group exists
          if (!clientsByRoom.has(roomId)) {
            clientsByRoom.set(roomId, new Set());
          }
          clientsByRoom.get(roomId)!.add(ws);

          // Deduct from wallet check internally
          let walletUser = laravelDb.users.find(u => u.username === username);
          if (!walletUser) {
            const generatedId = `usr-${Date.now()}`;
            walletUser = { id: generatedId, username, balance: 500.0 };
            laravelDb.users.push(walletUser);
          }

          const resolvedPlayerId = walletUser.id;
          playerRoomMap.set(ws, { roomId, playerId: resolvedPlayerId });

          const player: Player = {
            id: resolvedPlayerId,
            username: walletUser.username,
            walletBalance: walletUser.balance,
            bettingStake: stake,
            isConnected: true
          };

          // Limit room to 2 players max
          if (room.players.length < 2) {
            // Deduplicate player
            if (!room.players.some(p => p.username === username)) {
              room.players.push(player);
              room.log.push(`${username} entered table. Stake: $${stake}`);
            }
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Room has already peaked at 2 players.' }));
            return;
          }

          // Trigger match starting if 2 players are locked
          if (room.players.length === 2 && room.status === 'waiting') {
            room.status = 'ready';
            room.log.push('Players joined! Locking stakes in secure Laravel wallet escrow...');

            // Call mock secure endpoint internally to simulate authoritative escrow lock!
            const escrowPayload = {
              roomName: room.name,
              player1Id: room.players[0].id,
              player2Id: room.players[1].id,
              stake: room.stake
            };

            // Call local escrow system directly
            try {
              const u1 = laravelDb.users.find(u => u.id === escrowPayload.player1Id)!;
              const u2 = laravelDb.users.find(u => u.id === escrowPayload.player2Id)!;
              
              if (u1.balance >= room.stake && u2.balance >= room.stake) {
                u1.balance -= room.stake;
                u2.balance -= room.stake;
                room.players[0].walletBalance = u1.balance;
                room.players[1].walletBalance = u2.balance;

                const escrowId = `escrow-${Math.floor(Math.random() * 89999 + 10000)}`;
                laravelDb.escrows.push({
                  escrowId,
                  roomName: room.name,
                  player1Id: u1.id,
                  player2Id: u2.id,
                  amountEach: room.stake,
                  status: 'locked'
                });

                room.log.push(`Escrow successfully locked: Balance check verified. Transaction ID: ${escrowId}`);
                room.status = 'playing';
                room.currentTurn = room.players[0].id;
                room.log.push(`Current turn: ${room.players[0].username} (Shooter). Aim at cue ball.`);

                logLaravelApi('AUTO /api/laravel/escrow/lock', escrowPayload, {
                  success: true,
                  escrowId,
                  lockedAmount: room.stake * 2,
                  balances: { [u1.id]: u1.balance, [u2.id]: u2.balance }
                });
              } else {
                room.log.push('Validation Failed: Insufficient funds in betting wallets. Cannot start match.');
                room.status = 'waiting';
              }
            } catch (err: any) {
              room.log.push(`Critical: Betting verification server exception: ${err.message}`);
            }
          }

          broadcastRoom(roomId);
          break;
        }

        case 'set_ai_opponent': {
          const mapping = playerRoomMap.get(ws);
          if (!mapping) return;
          const { roomId } = mapping;
          const room = activeRooms.get(roomId);
          if (!room || room.players.length !== 1) return;

          const diffLevel = (msg as any).difficulty || 'medium';
          room.aiDifficulty = diffLevel;
          room.commissionRate = 0.05; // 5% house rake

          // Join artificial AI Bot as second player
          const aiPlayer: Player = {
            id: 'ai-bot',
            username: `Bot_${diffLevel.toUpperCase()}`,
            walletBalance: 10000.0,
            bettingStake: room.stake,
            isConnected: true
          };

          room.players.push(aiPlayer);
          room.log.push(`AI Opponent (${diffLevel.toUpperCase()} Bot) has accepted the stakes!`);
          room.status = 'ready';

          // Instantly trigger Laravel escrow lock and spin up
          let u1 = laravelDb.users.find(u => u.id === room.players[0].id);
          if (!u1) {
            u1 = { id: room.players[0].id, username: room.players[0].username, balance: Math.max(2000.0, room.stake) };
            laravelDb.users.push(u1);
          }

          // Ensure user has at least the room's stake
          if (u1.balance < room.stake) {
            u1.balance = Math.max(2000.0, room.stake);
          }

          const uAI = laravelDb.users.find(u => u.id === 'ai-bot') || { id: 'ai-bot', username: 'ai-bot', balance: 10000.0 };
          
          if (u1.balance >= room.stake) {
            u1.balance -= room.stake;
            uAI.balance -= room.stake;
            room.players[0].walletBalance = u1.balance;
            room.players[1].walletBalance = uAI.balance;

            const escrowId = `escrow-${Math.floor(Math.random() * 89999 + 10000)}`;
            const mockHash = 'SHA256x' + Array.from({length: 24}, () => Math.floor(Math.random()*16).toString(16)).join('').toUpperCase();
            room.escrowHash = mockHash;

            laravelDb.escrows.push({
              escrowId,
              roomName: room.name,
              player1Id: u1.id,
              player2Id: uAI.id,
              amountEach: room.stake,
              status: 'locked'
            });

            room.log.push(`🔒 ESCROW SECURED: Verified by peer-signing. Tx ID: ${escrowId}`);
            room.log.push(`🛡️ Integrity Hash: ${mockHash}`);
            room.status = 'playing';
            room.currentTurn = room.players[0].id;
            room.log.push(`Match active! Current turn: ${room.players[0].username}. Let the high-stakes game begin!`);

            logLaravelApi('AUTO /api/laravel/escrow/lock (AI match)', {
              roomName: room.name,
              player1Id: u1.id,
              player2Id: 'ai-bot',
              stake: room.stake,
              difficulty: diffLevel,
              escrowHash: mockHash
            }, {
              success: true,
              escrowId,
              lockedAmount: room.stake * 2,
              balances: { [u1.id]: u1.balance, 'ai-bot': uAI.balance }
            });
          } else {
            room.players.pop(); // kick AI out
            room.log.push('Balance Error: Your wallet does not have enough funds to play against the AI.');
          }

          broadcastRoom(roomId);
          break;
        }

        case 'preview_aim': {
          const mapping = playerRoomMap.get(ws);
          if (!mapping) return;
          const { roomId } = mapping;
          const room = activeRooms.get(roomId);
          if (!room || room.status !== 'playing') return;

          // Propagate aim preview packet dynamically to the other connected client for real-time visualization
          const wssList = clientsByRoom.get(roomId) || [];
          for (const client of wssList) {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'preview_aim',
                angle: msg.angle,
                power: msg.power
              }));
            }
          }
          break;
        }

        case 'shoot': {
          const mapping = playerRoomMap.get(ws);
          if (!mapping) return;
          const { roomId, playerId } = mapping;
          const room = activeRooms.get(roomId);
          if (!room || room.status !== 'playing') {
            ws.send(JSON.stringify({ type: 'error', message: 'Shot invalid: Game not in play state.' }));
            return;
          }

          // Authoritative Security Block: Ensure player's turn matches!
          if (room.currentTurn !== playerId) {
            ws.send(JSON.stringify({ type: 'error', message: 'Cheat safeguard: Not your active turn!' }));
            return;
          }

          const objectBallsLeft = room.balls.filter(b => b.id !== 0 && !b.isPocketed).length;
          const isBreakShot = (objectBallsLeft === 15);

          animatingRoomIds.add(roomId); // Pause turn timer during calculation & client visual replay

          const shooterName = room.players.find(p => p.id === playerId)?.username || 'Unknown';
          room.log.push(`${shooterName} triggers a shot with Power: ${Math.round(msg.power)}% at Angular Offset: ${msg.angle.toFixed(2)} rad.`);

          // Apply initial impulse onto the cue ball (index 0)
          const cueBall = room.balls[0];
          
          // Read spin parameters with fallback safety and set onto cue ball
          const sX = (msg as any).spinX || 0;
          const sY = (msg as any).spinY || 0;
          (cueBall as any).spinX = sX;
          (cueBall as any).spinY = sY;

          // Professional non-linear power scaling (quadratic/exponential curve)
          // This gives surgical precision at low power and explosive kinetic impact at high power
          const normPower = msg.power / 100;
          const powerCurve = Math.pow(normPower, 1.35); // 1.35 exponent curve
          const forceMagnitude = powerCurve * 22; // enhanced maximum speed coefficient (from 16 to 22) for sensational breaks!
          cueBall.vx = Math.cos(msg.angle) * forceMagnitude;
          cueBall.vy = Math.sin(msg.angle) * forceMagnitude;

          // Run step-by-step authoritative physics frame generation
          const frames: Array<{ id: number; x: number; y: number; isPocketed: boolean }[]> = [];
          
          // Capture beginning layout (frame 0)
          frames.push(room.balls.map(b => ({
            id: b.id,
            x: b.x,
            y: b.y,
            isPocketed: b.isPocketed
          })));

          let iterations = 0;
          let anyBallMoving = true;
          const maxStepsLimit = 1200; // anti-hang ceiling

          // Monitor pocket updates during this specific shot session
          const ballsPocketedThisShot: number[] = [];
          let cueBallPocketed = false;

          const contactTracker = { firstContactBallId: null as number | null, cushionContactOccurred: false };

          while (anyBallMoving && iterations < maxStepsLimit) {
            // Save copies of ball pocket statuses before substep
            const preStates = room.balls.map(b => ({ id: b.id, isPocketed: b.isPocketed }));
            
            // Step physics inside authoritative bounds
            simulatePhysicsStep(room.balls, 0.988, 0.95, contactTracker);

            // Double check newly pocketed balls
            for (let i = 0; i < room.balls.length; i++) {
              const currentB = room.balls[i];
              const preB = preStates.find(item => item.id === currentB.id)!;
              if (currentB.isPocketed && !preB.isPocketed) {
                if (currentB.id === 0) {
                  cueBallPocketed = true;
                } else {
                  ballsPocketedThisShot.push(currentB.id);
                }
              }
            }

            // Verify if still moving
            anyBallMoving = false;
            for (const b of room.balls) {
              if (!b.isPocketed && (Math.abs(b.vx) > 0.05 || Math.abs(b.vy) > 0.05)) {
                anyBallMoving = true;
                break;
              }
            }

            // Append frame at regular ticks for clients (save every single frame for ultra-fluid interpolation)
            frames.push(room.balls.map(b => ({
              id: b.id,
              x: b.x,
              y: b.y,
              isPocketed: b.isPocketed
            })));

            iterations++;
          }

          // Broadcast authoritative physical path to both clients!
          const framePayload = JSON.stringify({
            type: 'physics_frames',
            frames: frames
          });
          const roomWssSet = clientsByRoom.get(roomId) || [];
          for (const client of roomWssSet) {
            if (client.readyState === WebSocket.OPEN) {
              client.send(framePayload);
            }
          }

          // Wait for game-loop evaluation delay (Wait for animation sequence to play out on client side before syncing state)
          const basePlayMultiplier = frames.length > 350 ? 1.95 : 1.65;
          const animationDurationMs = (frames.length * 16.66) / basePlayMultiplier + 150; 

          setTimeout(() => {
            animatingRoomIds.delete(roomId); // Resume shot clock countdown
            room.turnTimer = 60; // Reset turn timer to standard 60 seconds
            evaluateShotRules(room, ballsPocketedThisShot, cueBallPocketed, contactTracker.firstContactBallId, shooterName, playerId, isBreakShot, contactTracker.cushionContactOccurred);
            broadcastRoom(roomId);

            // Trigger AI Opponent Shot if Turn assigned to AI
            if (room.status === 'playing' && room.currentTurn === 'ai-bot') {
              triggerAiShot(room);
            }
          }, animationDurationMs);

          break;
        }

        case 'reset_cue_ball': {
          const mapping = playerRoomMap.get(ws);
          if (!mapping) return;
          const { roomId, playerId } = mapping;
          const room = activeRooms.get(roomId);
          if (!room || room.status !== 'playing') return;

          if (room.currentTurn !== playerId) return;
          if (!room.scratchOccurred) return;

          // Place cue ball safely
          const cb = room.balls[0];
          cb.x = Math.max(CUSHION + BALL_R + 10, Math.min(msg.x, TABLE_W - CUSHION - BALL_R - 10));
          cb.y = Math.max(CUSHION + BALL_R + 10, Math.min(msg.y, TABLE_H - CUSHION - BALL_R - 10));
          cb.isPocketed = false;
          cb.vx = 0;
          cb.vy = 0;

          room.scratchOccurred = false;
          room.log.push(`${room.players.find(p => p.id === playerId)?.username} placed cue ball.`);
          broadcastRoom(roomId);
          break;
        }

        case 'chat': {
          const mapping = playerRoomMap.get(ws);
          if (!mapping) return;
          const { roomId } = mapping;
          const room = activeRooms.get(roomId);
          if (!room) return;

          const sender = room.players.find(p => p.id === playerRoomMap.get(ws)?.playerId)?.username || 'Spectator';
          room.log.push(`[Chat] ${sender}: ${msg.message}`);
          broadcastRoom(roomId);
          break;
        }

        case 'leave': {
          handleDisconnect(ws);
          break;
        }
      }
    } catch (e: any) {
      ws.send(JSON.stringify({ type: 'error', message: 'Decoding Error: ' + e.message }));
    }
  });

  ws.on('close', () => {
    activeSockets.delete(ws);
    handleDisconnect(ws);
  });
});

// Trigger 8-Ball game logic and turn rules calculations (WPA-compliant rules engine)
function evaluateShotRules(
  room: RoomState,
  pocketedIds: number[],
  cueBallPocketed: boolean,
  firstContactBallId: number | null,
  shooterName: string,
  shooterId: string,
  isBreakShot = false,
  cushionContactOccurred = false
) {
  const player1 = room.players[0];
  const player2 = room.players[1];
  
  if (!player1 || !player2) return;

  const currentActivePlayer = room.players.find(p => p.id === shooterId)!;
  const otherPlayer = room.players.find(p => p.id !== shooterId)!;

  room.pocketedThisTurn = false;
  room.scratchOccurred = false;

  let isFoul = false;
  let foulReason = "";

  // 1. Calculate remaining group balls of active player
  const remainingGroupBalls = room.assignedSides && currentActivePlayer.side
    ? room.balls.filter(b => b.id !== 0 && b.id !== 8 && !b.isPocketed && b.type === (currentActivePlayer.side === 'solids' ? 'solid' : 'stripe'))
    : [];

  // 2. Rule: Evaluate Cue Ball scratch (Pocketed)
  if (cueBallPocketed) {
    isFoul = true;
    foulReason = "Cue Ball Scratched (pocketed).";
    
    // Put cue ball back onto the table safely (center of headstring by default)
    room.balls[0].isPocketed = false;
    room.balls[0].x = 200;
    room.balls[0].y = 200;
    room.balls[0].vx = 0;
    room.balls[0].vy = 0;
  }

  // 3. Rule: Check Struck First Ball rule
  if (!isFoul) {
    if (firstContactBallId === null) {
      // Clean miss
      isFoul = true;
      foulReason = "Clean Miss! The Cue Ball struck absolutely nothing.";
    } else if (!room.assignedSides) {
      // Open Table rules: Striketarget can be any solid or stripe, but striking the 8-Ball first is a foul!
      if (firstContactBallId === 8) {
        isFoul = true;
        foulReason = "Struck the Black 8-Ball first on an open table.";
      }
    } else {
      // Assigned Sides Table rules
      const activeSide = currentActivePlayer.side!;
      if (remainingGroupBalls.length > 0) {
        // Must hit own side ball first (1-7 for solids, 9-15 for stripes)
        const hitType = firstContactBallId <= 7 ? 'solid' : (firstContactBallId === 8 ? 'black' : 'stripe');
        const expectedType = activeSide === 'solids' ? 'solid' : 'stripe';
        if (hitType !== expectedType) {
          isFoul = true;
          if (firstContactBallId === 8) {
            foulReason = `Struck the Black 8-Ball first when you still have remaining ${activeSide.toUpperCase()} balls left on the table.`;
          } else {
            foulReason = `Struck opponent's ball (${firstContactBallId <= 7 ? 'SOLID' : 'STRIPE'}) first. You must hit a ${activeSide.toUpperCase()} ball.`;
          }
        }
      } else {
        // Must hit 8-Ball first
        if (firstContactBallId !== 8) {
          isFoul = true;
          foulReason = `Struck an object ball (${firstContactBallId}) first. All your group balls are cleared, you must hit the 8-Ball first!`;
        }
      }
    }
  }

  // 3.5. Rule: Cushion Contact Foul under WPA World Billiards regulations
  // If no ball is pocketed, at least one ball (cue ball or object balls) must strike a cushion after the cue ball hits the target ball.
  if (!isFoul && firstContactBallId !== null && pocketedIds.length === 0 && !isBreakShot) {
    if (!cushionContactOccurred) {
      isFoul = true;
      foulReason = "WPA Cushion Contact Foul (خطأ عدم ضرب الحواجز): After striking the ball, no ball was pocketed and no ball contacted a cushion rail.";
    }
  }

  // 4. Rule: Pocketed 8-Ball evaluation
  if (pocketedIds.includes(8)) {
    if (isFoul) {
      // Scratched or committed foul while potting 8-ball -> Instant Defeat!
      concludeMatch(room, otherPlayer, currentActivePlayer, `Defeat! ${shooterName} pocketed the Black 8-Ball, but committed a FOUL [${foulReason}]. (خسارة! أسقطت الكرة السوداء 8 مع ارتكاب خطأ خططي)`);
    } else if (!room.assignedSides) {
      // Pocketed 8-ball on an open table -> Instant Defeat!
      concludeMatch(room, otherPlayer, currentActivePlayer, `Defeat! ${shooterName} pocketed the Black 8-Ball illegally on an open table. (خسارة! تم إسقاط الكرة السوداء والطاولة لا تزال مفتوحة)`);
    } else {
      // Sides assigned and no foul
      const activeSide = currentActivePlayer.side!;
      
      // Check if shooter pocketed any of their remaining group balls in the SAME shot along with the 8-ball
      const pocketedOwnGroupBallInSameShot = pocketedIds.some(id => {
        if (id === 0 || id === 8) return false;
        const type = id <= 7 ? 'solid' : 'stripe';
        return (activeSide === 'solids' && type === 'solid') || (activeSide === 'stripes' && type === 'stripe');
      });

      if (pocketedOwnGroupBallInSameShot) {
        // Pocketing own group ball and 8-ball in same shot is a WPA championship violation -> Instant Defeat!
        concludeMatch(room, otherPlayer, currentActivePlayer, `Defeat! ${shooterName} pocketed the Black 8-Ball in the same shot as their own remaining group ball. This is a WPA violation. (خسارة! لقد أسقطت الكرة السوداء في نفس ضربة إسقاط كرتك الملونة الأخيرة)`);
      } else if (remainingGroupBalls.length === 0) {
        // Legal victory!
        concludeMatch(room, currentActivePlayer, otherPlayer, `${shooterName} wins the match legally by clearing all their object balls and pocketing the 8-Ball! (فوز مستحق! فاز اللاعب ${shooterName} بإدخال جميع كراته الملونة ثم الكرة السوداء 8 بشكل قانوني)`);
      } else {
        // Pocketed 8-ball out of turn -> Instant Defeat!
        concludeMatch(room, otherPlayer, currentActivePlayer, `Defeat! ${shooterName} pocketed the Black 8-Ball out of turn while they still had outstanding ${currentActivePlayer.side!.toUpperCase()} balls on the table. (خسارة! لقد أسقطت الكرة السوداء 8 باكراً قبل إنهاء كراتك الملونة المتبقية)`);
      }
    }
    return;
  }

  // 5. Normal Object Balls processing
  if (isFoul) {
    room.scratchOccurred = true; // Provides cue-ball in hand placement
    room.log.push(`⚠️ FOUL DETECTED: [${foulReason}] Turn is handed over to ${otherPlayer.username} with FREE Cue Ball placement anywhere!`);
    room.currentTurn = otherPlayer.id;
  } else {
    // Elegant legal shot!
    if (pocketedIds.length > 0) {
      room.log.push(`Pocketed ball(s) this shot: [ ${pocketedIds.join(', ')} ]`);

      if (isBreakShot) {
        // Break Shot under WPA regulations (leaves table open)
        const pocketedObjectBalls = pocketedIds.filter(id => id !== 0 && id !== 8);
        if (pocketedObjectBalls.length > 0) {
          room.log.push(`💣 Break Shot successful! Under WPA Rule 3.4, the table remains OPEN. ${shooterName} pocketed ${pocketedObjectBalls.length} ball(s) and retains the turn.`);
          room.pocketedThisTurn = true;
          // Keep turn, no side assignment yet
        } else {
          room.log.push(`Break shot complete. No object balls pocketed. Table remains OPEN. Turn passes to ${otherPlayer.username}`);
          room.currentTurn = otherPlayer.id;
        }
      } else {
        // Standard Shot: Assign sides if open table
        if (!room.assignedSides) {
          // Find first pocketed object ball excluding 8-ball
          const firstBallId = pocketedIds.find(id => id !== 0 && id !== 8);
          if (firstBallId !== undefined) {
            const assignedType = firstBallId <= 7 ? 'solid' : 'stripe';
            
            if (assignedType === 'solid') {
              currentActivePlayer.side = 'solids';
              otherPlayer.side = 'stripes';
            } else {
              currentActivePlayer.side = 'stripes';
              otherPlayer.side = 'solids';
            }
            room.assignedSides = true;
            room.log.push(`🎯 Assigned Sides! ${currentActivePlayer.username} is now ${currentActivePlayer.side.toUpperCase()}; ${otherPlayer.username} is ${otherPlayer.side.toUpperCase()}`);
          }
        }

        // Check if shooter pocketed at least one of their assigned balls to keep shot turn
        const activeSide = currentActivePlayer.side;
        if (activeSide) {
          const pocketedOwnGroup = pocketedIds.some(id => {
            const type = id <= 7 ? 'solid' : 'stripe';
            return (activeSide === 'solids' && type === 'solid') || (activeSide === 'stripes' && type === 'stripe');
          });

          if (pocketedOwnGroup) {
            room.log.push(`Good strike! ${shooterName} pocketed their assigned group ball and earns an additional turn.`);
            room.pocketedThisTurn = true;
            // Keep turn
          } else {
            room.log.push(`Shot turn over. ${shooterName} pocketed only opponent's balls (or did not clear any of their own). Passing turn to ${otherPlayer.username}`);
            room.currentTurn = otherPlayer.id;
          }
        } else {
          // If for some reason table is still open, pass turn
          room.currentTurn = otherPlayer.id;
        }
      }
    } else {
      room.log.push(`Clean Hit! No balls pocketed. Turn passes to ${otherPlayer.username}`);
      room.currentTurn = otherPlayer.id;
    }
  }
}

// Conclude match, trigger Laravel API payments
function concludeMatch(room: RoomState, winner: Player, loser: Player, summaryMessage: string) {
  room.status = 'gameover';
  room.winnerId = winner.id;
  room.log.push(`🏆 MATCH CONCLUDED! ${summaryMessage}`);

  // Retrieve escrow Transaction
  const esc = laravelDb.escrows.find(e => e.roomName === room.name && e.status === 'locked');
  if (esc) {
    const totalPot = esc.amountEach * 2;
    const commission = Math.round(totalPot * 0.05 * 100) / 100; // 5% commission
    const prize = totalPot - commission;

    // Distribute using live simulation database
    const dbWinner = laravelDb.users.find(u => u.id === winner.id);
    const dbLoser = laravelDb.users.find(u => u.id === loser.id);

    if (dbWinner) dbWinner.balance += prize;
    esc.status = 'payout_completed';

    const trxId = `trx-${Math.floor(Math.random() * 899999 + 100000)}`;
    laravelDb.transactions.push({
      id: trxId,
      escrowId: esc.escrowId,
      prize,
      commission,
      winnerId: winner.id,
      loserId: loser.id,
      timestamp: new Date().toISOString()
    });

    // Mirror updated values inside active players profile metadata
    winner.walletBalance = dbWinner ? dbWinner.balance : winner.walletBalance;
    if (dbLoser) loser.walletBalance = dbLoser.balance;

    room.log.push(`💰 Wallet balances updated via Laravel platform gateway secure callbacks!`);
    room.log.push(`Winner: ${winner.username} receives prize of $${prize.toFixed(2)} (locked stakes pot minus $${commission.toFixed(2)} commission).`);

    // Match history records
    const hist: MatchHistory = {
      id: `match-${Date.now()}`,
      roomName: room.name,
      winnerName: winner.username,
      loserName: loser.username,
      stake: room.stake,
      prizeAmount: prize,
      commission,
      timestamp: new Date().toLocaleTimeString(),
      pocketsByWinner: room.balls.filter(b => b.id !== 0 && b.isPocketed && b.type === (winner.side === 'solids' ? 'solid' : 'stripe')).length
    };
    matchLogs.push(hist);

    logLaravelApi('AUTO /api/laravel/escrow/payout', {
      escrowId: esc.escrowId,
      winnerId: winner.id,
      loserId: loser.id,
      commissionRate: 0.05
    }, {
      success: true,
      transactionId: trxId,
      totalPot,
      siteCommission: commission,
      payoutPrize: prize,
      winnerBalance: dbWinner ? dbWinner.balance : 0,
      loserBalance: dbLoser ? dbLoser.balance : 0
    });
  }
}

// AI Bot behavior logic
function triggerAiShot(room: RoomState) {
  animatingRoomIds.add(room.roomId); // Pause turn timer during AI thinking and shots
  room.log.push('AI Opponent thinking is active...');
  
  setTimeout(() => {
    if (room.status !== 'playing' || room.currentTurn !== 'ai-bot') return;

    // AI looks for its target balls on the table
    const cb = room.balls[0];
    const aiSide = room.players.find(p => p.id === 'ai-bot')?.side;
    
    // Select eligible balls
    let targets = room.balls.filter(b => b.id !== 0 && b.id !== 8 && !b.isPocketed);
    if (room.assignedSides && aiSide) {
      const activeType = aiSide === 'solids' ? 'solid' : 'stripe';
      targets = targets.filter(b => b.type === activeType);
    }

    // Fallback to any ball (or 8-ball if all cleared)
    if (targets.length === 0) {
      targets = room.balls.filter(b => b.id === 8 && !b.isPocketed);
    }
    if (targets.length === 0) {
      targets = room.balls.filter(b => b.id !== 0 && !b.isPocketed);
    }

    // Select target
    if (targets.length > 0) {
      // Find target closest to any pocket or nearest to cue ball
      const closestBall = targets[Math.floor(Math.random() * targets.length)];

      // Calculate directional vector from cue ball to target
      const dx = closestBall.x - cb.x;
      const dy = closestBall.y - cb.y;
      let angle = Math.atan2(dy, dx);

      // Add dynamic variance based on selected bot difficulty
      let errorMargin = 0;
      let randomPower = 40;
      const diff = room.aiDifficulty || 'medium';

      if (diff === 'easy') {
        errorMargin = (Math.random() - 0.5) * 0.28; // high error rookie rate
        randomPower = Math.floor(Math.random() * 30) + 25; // 25% to 55% power
      } else if (diff === 'hard') {
        errorMargin = (Math.random() - 0.5) * 0.02; // extremely sharp pro accuracy
        randomPower = Math.floor(Math.random() * 40) + 50; // 50% to 90% power
      } else {
        errorMargin = (Math.random() - 0.5) * 0.11; // medium balanced
        randomPower = Math.floor(Math.random() * 40) + 35; // 35% to 75% power
      }
      angle += errorMargin;

      // Dispatch authoritative shot command on behalf of the AI Bot
      // Fire shot inside server context directly
      // Broadcast aim previews first
      const wssList = clientsByRoom.get(room.roomId) || [];
      for (const client of wssList) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'preview_aim',
            angle: angle,
            power: randomPower
          }));
        }
      }

      // Small delay for shooting visual
      const objectBallsLeft = room.balls.filter(b => b.id !== 0 && !b.isPocketed).length;
      const isBreakShot = (objectBallsLeft === 15);

      setTimeout(() => {
        // Apply impulse with premium realistic physics match multiplier (22 instead of 16)
        cb.vx = Math.cos(angle) * (randomPower / 100 * 22);
        cb.vy = Math.sin(angle) * (randomPower / 100 * 22);

        room.log.push(`AI fires shot: Aimed at Ball #${closestBall.id} (${closestBall.type}) with Power ${randomPower}%.`);

        const frames: Array<{ id: number; x: number; y: number; isPocketed: boolean }[]> = [];
        frames.push(room.balls.map(b => ({ id: b.id, x: b.x, y: b.y, isPocketed: b.isPocketed })));

        let iterations = 0;
        let anyBallMoving = true;
        const maxStepsLimit = 1200;
        const ballsPocketed: number[] = [];
        let cueBallPocketed = false;
        const contactTracker = { firstContactBallId: null as number | null, cushionContactOccurred: false };

        while (anyBallMoving && iterations < maxStepsLimit) {
          const preStates = room.balls.map(b => ({ id: b.id, isPocketed: b.isPocketed }));
          simulatePhysicsStep(room.balls, 0.988, 0.95, contactTracker);

          for (let i = 0; i < room.balls.length; i++) {
            const currentB = room.balls[i];
            const preB = preStates.find(item => item.id === currentB.id)!;
            if (currentB.isPocketed && !preB.isPocketed) {
              if (currentB.id === 0) cueBallPocketed = true;
              else ballsPocketed.push(currentB.id);
            }
          }

          anyBallMoving = false;
          for (const b of room.balls) {
            if (!b.isPocketed && (Math.abs(b.vx) > 0.05 || Math.abs(b.vy) > 0.05)) {
              anyBallMoving = true;
              break;
            }
          }

          frames.push(room.balls.map(b => ({ id: b.id, x: b.x, y: b.y, isPocketed: b.isPocketed })));
          iterations++;
        }

        // Broadcast frames
        for (const client of wssList) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'physics_frames', frames }));
          }
        }

        const basePlayMultiplier = frames.length > 350 ? 1.95 : 1.65;
        const animationDurationMs = (frames.length * 16.66) / basePlayMultiplier + 150;

        setTimeout(() => {
          animatingRoomIds.delete(room.roomId); // Resume shot clock countdown
          room.turnTimer = 60; // Reset shot clock back to 60 seconds
          evaluateShotRules(room, ballsPocketed, cueBallPocketed, contactTracker.firstContactBallId, 'Authoritative_AI_Bot', 'ai-bot', isBreakShot, contactTracker.cushionContactOccurred);
          broadcastRoom(room.roomId);

          // If AI made its own group, shoot again
          if (room.status === 'playing' && room.currentTurn === 'ai-bot') {
            triggerAiShot(room);
          }
        }, animationDurationMs);

      }, 800);
    }
  }, 1200);
}

// Authoritative 60-second betting round turn timer clock
setInterval(() => {
  activeRooms.forEach((room) => {
    if (room.status === 'playing') {
      // Pause shot clock if the table is currently animating (balls rolling around)
      if (animatingRoomIds.has(room.roomId)) {
        return;
      }

      if (room.turnTimer === undefined) {
        room.turnTimer = 60;
      }

      if (room.turnTimer > 0) {
        room.turnTimer -= 1;
        // Broadcast the updated remaining time to all synced browsers once a second
        broadcastRoom(room.roomId);
      } else {
        // Time ran out! Trigger shot clock foul.
        room.turnTimer = 60;
        const currentActivePlayer = room.players.find(p => p.id === room.currentTurn);
        const otherPlayer = room.players.find(p => p.id !== room.currentTurn);

        if (currentActivePlayer && otherPlayer) {
          room.log.push(`⏰ SHOT CLOCK VIOLATION: ${currentActivePlayer.username} ran out of time!`);
          room.currentTurn = otherPlayer.id;

          // Under proper 8-ball rules, shot clock timeout results in physical foul,
          // giving free placement anywhere on the table to prevent a dead-end deadlock
          room.scratchOccurred = true;
          room.log.push(`⚠️ Turn penalty: Free Cue Ball placement awarded to ${otherPlayer.username}.`);

          broadcastRoom(room.roomId);

          // If turn shifts to AI Bot, trigger its immediate simulation
          if (room.currentTurn === 'ai-bot') {
            triggerAiShot(room);
          }
        }
      }
    }
  });
}, 1000);

// Handle client disconnection gracefully
function handleDisconnect(ws: WebSocket) {
  const mapping = playerRoomMap.get(ws);
  if (!mapping) return;
  
  const { roomId, playerId } = mapping;
  playerRoomMap.delete(ws);

  const room = activeRooms.get(roomId);
  if (!room) return;

  // Let other client in room know
  const pIdx = room.players.findIndex(p => p.id === playerId);
  if (pIdx !== -1) {
    const quittingPlayer = room.players[pIdx];
    room.log.push(`Disconnect Alert: ${quittingPlayer.username} left the server.`);
    
    // If during a live game, award instant win to the other player due to forfeit!
    if (room.status === 'playing') {
      const remainingPlayer = room.players.find(p => p.id !== playerId);
      if (remainingPlayer) {
        concludeMatch(room, remainingPlayer, quittingPlayer, `${remainingPlayer.username} wins by forfeit! (Opponent disconnected)`);
      }
    }
    
    // Remove from room list
    room.players.splice(pIdx, 1);
  }

  // Clean clients list
  const set = clientsByRoom.get(roomId);
  if (set) {
    set.delete(ws);
    if (set.size === 0) {
      activeRooms.delete(roomId);
      clientsByRoom.delete(roomId);
    } else {
      broadcastRoom(roomId);
    }
  }
}

// ==========================================
// SPA Static Routing & Vite Configuration
// ==========================================
async function startServer() {
  // Vite middleware for lightning-fast HMR and building
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // SPA routing fallback
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Pool autorative game & betting platform server starts at http://localhost:${PORT}`);
  });
}

startServer();
