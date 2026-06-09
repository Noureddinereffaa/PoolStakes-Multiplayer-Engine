import crypto, { randomUUID } from 'crypto';
import { Express, Request, Response, NextFunction } from 'express';
import { WebSocket } from 'ws';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from './db';
import { logger } from './logger';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  logger.error('FATAL: JWT_SECRET environment variable is not set');
  process.exit(1);
}
if (JWT_SECRET === 'your_super_secure_random_string_at_least_32_characters_long') {
  logger.error('FATAL: JWT_SECRET is still set to the default placeholder value. Generate a strong random secret and update .env');
  process.exit(1);
}
if (JWT_SECRET.length < 32) {
  logger.warn('JWT_SECRET is less than 32 characters — consider using a longer, more secure secret');
}

// Seed initial bots if they don't exist
async function seedBots() {
  const aiBot = await prisma.user.findUnique({ where: { username: 'Authoritative_AI_Bot' } });
  if (!aiBot) {
    await prisma.user.create({
      data: {
        id: 'ai-bot',
        username: 'Authoritative_AI_Bot',
        password: 'ai-password', // Bots don't login but need this
        balance: 99999.0,
      }
    });
  }
}

seedBots().catch(err => logger.error('Failed to seed bots', { error: String(err) }));

// ── Expired Guest Cleanup (every 30 minutes) ───────────────
const GUEST_CLEANUP_INTERVAL_MS = 30 * 60 * 1000;
setInterval(async () => {
  try {
    const result = await prisma.user.deleteMany({
      where: { guestExpiresAt: { lte: new Date() } }
    });
    if (result.count > 0) {
      logger.info('Cleaned up expired guest accounts', { count: result.count });
    }
  } catch (err) {
    logger.error('Guest cleanup failed', { error: String(err) });
  }
}, GUEST_CLEANUP_INTERVAL_MS);

// ── JWT Authentication Middleware ──────────────────────────
function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>
  if (!token) {
    return res.status(401).json({ success: false, error: 'Access denied. No token provided.' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; username: string };
    (req as any).user = decoded;
    next();
  } catch {
    return res.status(403).json({ success: false, error: 'Invalid or expired token.' });
  }
}

// ── Simple In-Memory Rate Limiter ──────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 100; // max requests per window per IP

// Clean up expired rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 300_000).unref();

function rateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    next();
    return;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return res.status(429).json({ success: false, error: 'Too many requests. Please slow down.' });
  }
  next();
}

const SENSITIVE_KEYS = new Set(['password', 'token', 'secret', 'authorization', 'accessToken']);

function sanitizeForLog(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForLog(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export async function logLaravelApi(
  _broadcastToAllWebSockets: (messageObj: Record<string, unknown>) => void,
  apiName: string,
  reqBody: Record<string, unknown>,
  response: Record<string, unknown>
): Promise<void> {
  try {
    const safePayload = sanitizeForLog(reqBody);
    const safeResponse = sanitizeForLog(response);
    await prisma.apiLog.create({
      data: {
        apiName,
        payload: JSON.stringify(safePayload),
        response: JSON.stringify(safeResponse),
      }
    });
  } catch (error) {
    logger.error('Failed to write API log', { error: String(error) });
  }
}

export function registerLaravelRoutes(app: Express, broadcastToAllWebSockets: (messageObj: Record<string, unknown>) => void): void {
  const logLocalLaravelApi = (apiName: string, reqBody: Record<string, unknown>, response: Record<string, unknown>) =>
    logLaravelApi(broadcastToAllWebSockets, apiName, reqBody, response);

  // Health check (no rate limit, no auth)
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

  // Rate limiter on all routes
  app.use('/api/laravel', rateLimiter);

  // Public routes (no JWT required)
  app.post('/api/laravel/auth/guest', async (req, res) => {
    try {
      const guestName = 'Guest_' + Date.now() + '_' + randomUUID().slice(0, 8);
      const guestExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h TTL
      const guest = await prisma.user.create({
        data: {
          id: 'guest-' + randomUUID(),
          username: guestName,
          email: `${guestName}@guest.local`,
          password: randomUUID(),
          balance: 350.0,
          walletAddress: 'T' + crypto.randomBytes(8).toString('hex').toUpperCase() + 'usdtGuest',
          guestExpiresAt,
        }
      });
      const token = jwt.sign({ id: guest.id, username: guest.username }, JWT_SECRET, { expiresIn: '1d' });
      res.json({
        success: true, token,
        user: { id: guest.id, username: guest.username, balance: guest.balance, email: guest.email, walletAddress: guest.walletAddress }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Guest login failed.' });
    }
  });

  app.post('/api/laravel/auth/register', async (req, res) => {
    const { username, email, password, walletAddress } = req.body;
    if (!username || username.length < 3) {
      return res.status(400).json({ success: false, error: 'Username is required (min 3 characters)' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password is required and must be at least 6 characters' });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'Invalid email format.' });
    }

    try {
      const exists = await prisma.user.findFirst({
        where: {
          OR: [
            { username: { equals: username } },
            { email: { equals: email || '' } }
          ]
        }
      });

      if (exists) {
        return res.status(400).json({ success: false, error: 'Username or Email already registered' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = await prisma.user.create({
        data: {
          username,
          email: email || `${username}@playusdt.domain`,
          password: hashedPassword,
          balance: 500.0,
          walletAddress: walletAddress || 'T' + crypto.randomBytes(8).toString('hex').toUpperCase() + 'usdtTRC20'
        }
      });

      const token = jwt.sign({ id: newUser.id, username: newUser.username }, JWT_SECRET, { expiresIn: '7d' });
      const responsePayload = { success: true, token, user: { id: newUser.id, username: newUser.username, balance: newUser.balance, email: newUser.email, walletAddress: newUser.walletAddress } };
      logLocalLaravelApi('POST /api/laravel/auth/register', { username, email, walletAddress }, { success: true, userId: newUser.id, balance: newUser.balance });
      res.json(responsePayload);

    } catch (error) {
      res.status(500).json({ success: false, error: 'Registration failed due to server error.' });
    }
  });

  // ── Protected routes (JWT required) ─────────────────────
  app.use('/api/laravel/users', authenticateToken);
  app.use('/api/laravel/escrow', authenticateToken);
  app.use('/api/laravel/crypto', authenticateToken);
  app.use('/api/laravel/logs', authenticateToken);

  app.get('/api/laravel/users', async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const currentUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, email: true, balance: true, walletAddress: true }
      });
      // Return all users for leaderboard but WITHOUT balance/email
      const users = await prisma.user.findMany({
        select: { id: true, username: true, walletAddress: true }
      });
      const usersWithBalance = users.map(u => ({
        ...u,
        balance: u.id === userId ? (currentUser?.balance || 0) : 0,
        email: u.id === userId ? (currentUser?.email || null) : undefined
      }));
      res.json({ users: usersWithBalance, currentUser: currentUser ? { ...currentUser, balance: Number(currentUser.balance) } : null });
    } catch (error) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.post('/api/laravel/auth/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and Password are required' });
    }

    try {
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { username: { equals: username } },
            { email: { equals: username } }
          ]
        }
      });

      if (!user) {
        return res.status(401).json({ success: false, error: 'User not found in our betting records' });
      }

      const correctPassword = user.password;
      const isMatch = await bcrypt.compare(password, correctPassword);
      if (!isMatch) {
        return res.status(401).json({ success: false, error: 'Invalid password credentials' });
      }

      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
      const responsePayload = { success: true, token, user: { id: user.id, username: user.username, balance: user.balance, email: user.email, walletAddress: user.walletAddress } };
      logLocalLaravelApi('POST /api/laravel/auth/login', { username }, { success: true, userId: user.id });
      res.json(responsePayload);
    } catch (error) {
      res.status(500).json({ success: false, error: 'Login failed due to server error.' });
    }
  });

  app.post('/api/laravel/users/update', async (req, res) => {
    const { userId, delta } = req.body;
    if (userId !== (req as any).user.id) {
      return res.status(403).json({ success: false, error: 'You can only update your own balance.' });
    }
    const parsedDelta = parseFloat(delta);
    if (!isFinite(parsedDelta) || Math.abs(parsedDelta) > 100000) {
      return res.status(400).json({ success: false, error: 'Invalid delta amount (max 100,000).' });
    }
    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data: { balance: { increment: parsedDelta } }
      });
      if (Number(user.balance) < 0) {
        await prisma.user.update({ where: { id: userId }, data: { balance: 0 } });
      }
      const fresh = await prisma.user.findUnique({ where: { id: userId } });
      res.json({ success: true, user: { id: fresh!.id, username: fresh!.username, balance: fresh!.balance } });
    } catch (error) {
      res.status(404).json({ success: false, error: 'User not found' });
    }
  });

  app.post('/api/laravel/escrow/lock', async (req, res) => {
    const { roomName, player1Id, player2Id, stake } = req.body;
    try {
      // Run inside a transaction
      const result = await prisma.$transaction(async (tx) => {
        const u1 = await tx.user.findUnique({ where: { id: player1Id } });
        const u2 = await tx.user.findUnique({ where: { id: player2Id } });

        if (!u1 || !u2) {
          throw new Error('One or both players do not exist in database.');
        }

        if (u1.balance < stake || u2.balance < stake) {
          throw new Error('Insufficient funds in player account wallet.');
        }

        const updatedU1 = await tx.user.update({
          where: { id: player1Id },
          data: { balance: { decrement: stake } }
        });

        const updatedU2 = await tx.user.update({
          where: { id: player2Id },
          data: { balance: { decrement: stake } }
        });

        const escrow = await tx.escrow.create({
          data: {
            roomName,
            amountEach: stake,
            status: 'locked',
            player1Id: u1.id,
            player2Id: u2.id,
          }
        });

        return { escrow, balances: { [u1.id]: updatedU1.balance, [u2.id]: updatedU2.balance } };
      });

      const successResponse = {
        success: true,
        escrowId: result.escrow.id,
        lockedAmount: stake * 2,
        balances: result.balances
      };

      logLocalLaravelApi('POST /api/laravel/escrow/lock', req.body, successResponse);
      res.json(successResponse);
    } catch (error: any) {
      logLocalLaravelApi('POST /api/laravel/escrow/lock', req.body, { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  const SERVER_COMMISSION_RATE = 0.05;

  app.post('/api/laravel/escrow/payout', async (req, res) => {
    const { escrowId, winnerId, loserId } = req.body;
    const commissionRate = SERVER_COMMISSION_RATE;
    try {
      const responseData = await prisma.$transaction(async (tx) => {
        const esc = await tx.escrow.findFirst({ where: { id: escrowId, status: 'locked' } });
        if (!esc) throw new Error('Invalid or already processed Escrow transaction.');

        const originalWinner = await tx.user.findUnique({ where: { id: winnerId } });
        if (!originalWinner) throw new Error('Winner not found.');
        
        const originalLoser = await tx.user.findUnique({ where: { id: loserId } });

        const totalPot = Number(esc.amountEach) * 2;
        const commission = Math.round(totalPot * commissionRate * 100) / 100;
        const prize = totalPot - commission;

        const updatedWinner = await tx.user.update({
          where: { id: winnerId },
          data: { balance: { increment: prize } }
        });

        await tx.escrow.update({
          where: { id: escrowId },
          data: { status: 'payout_completed' }
        });

        const trx = await tx.transaction.create({
          data: {
            escrowId: esc.id,
            prize,
            commission,
            winnerId,
            loserId: originalLoser ? originalLoser.id : null
          }
        });

        return {
          success: true,
          transactionId: trx.id,
          totalPot,
          siteCommission: commission,
          payoutPrize: prize,
          winnerBalance: updatedWinner.balance,
          loserBalance: originalLoser ? originalLoser.balance : 0
        };
      });

      logLocalLaravelApi('POST /api/laravel/escrow/payout', req.body, responseData);
      res.json(responseData);
    } catch (error: any) {
      logLocalLaravelApi('POST /api/laravel/escrow/payout', req.body, { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/laravel/crypto/deposit', async (req, res) => {
    const { userId, amount, txHash } = req.body;
    if (userId !== (req as any).user.id) {
      return res.status(403).json({ success: false, error: 'You can only deposit to your own account.' });
    }
    const parsedAmount = parseFloat(amount);
    if (!isFinite(parsedAmount) || parsedAmount <= 0 || parsedAmount > 100000) {
      return res.status(400).json({ success: false, error: 'Invalid deposit amount (1–100,000).' });
    }
    try {
      const tx = await prisma.cryptoTransaction.create({
        data: { userId, type: 'DEPOSIT', amount: parsedAmount, txHash: txHash || 'manual-' + randomUUID(), status: 'PENDING' }
      });
      res.json({ success: true, transaction: tx, message: 'Deposit submitted for manual review. Balance will be credited after blockchain confirmation.' });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post('/api/laravel/crypto/withdraw', async (req, res) => {
    const { userId, amount, address } = req.body;
    if (userId !== (req as any).user.id) {
      return res.status(403).json({ success: false, error: 'You can only withdraw from your own account.' });
    }
    try {
      const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user || user.balance < amount) throw new Error('Insufficient balance');

        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: { balance: { decrement: amount } }
        });

        const cryptoTx = await tx.cryptoTransaction.create({
          data: { userId, type: 'WITHDRAWAL', amount, status: 'PENDING' }
        });

        return { user: updatedUser, tx: cryptoTx };
      });
      res.json({ success: true, transaction: result.tx, newBalance: result.user.balance });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.get('/api/laravel/logs', async (req, res) => {
    try {
      const logs = await prisma.apiLog.findMany({
        orderBy: { timestamp: 'desc' },
        take: 50
      });
      
      const formattedLogs = logs.map(l => ({
        id: l.id,
        apiName: l.apiName,
        payload: JSON.parse(l.payload),
        response: JSON.parse(l.response),
        timestamp: l.timestamp.toISOString()
      }));

      res.json({ logs: formattedLogs });
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve logs' });
    }
  });
}
