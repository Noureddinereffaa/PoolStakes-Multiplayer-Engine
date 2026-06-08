import { Express } from 'express';
import { WebSocket } from 'ws';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'super-secure-pool-betting-secret-999';

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

seedBots();

export async function logLaravelApi(broadcastToAllWebSockets: (messageObj: any) => void, apiName: string, reqBody: any, response: any) {
  try {
    const logItem = await prisma.apiLog.create({
      data: {
        apiName,
        payload: JSON.stringify(reqBody),
        response: JSON.stringify(response),
      }
    });

    broadcastToAllWebSockets({
      type: 'laravel_api_log',
      id: logItem.id,
      apiName,
      payload: reqBody,
      response,
      timestamp: logItem.timestamp.toISOString()
    });
  } catch (error) {
    console.error('Failed to write API log:', error);
  }
}

export function registerLaravelRoutes(app: Express, broadcastToAllWebSockets: (messageObj: any) => void) {
  const logLocalLaravelApi = (apiName: string, reqBody: any, response: any) =>
    logLaravelApi(broadcastToAllWebSockets, apiName, reqBody, response);

  app.get('/api/laravel/users', async (req, res) => {
    try {
      const users = await prisma.user.findMany({
        select: { id: true, username: true, email: true, balance: true, walletAddress: true }
      });
      res.json({ users });
    } catch (error) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.post('/api/laravel/auth/register', async (req, res) => {
    const { username, email, password, walletAddress } = req.body;
    if (!username) {
      return res.status(400).json({ success: false, error: 'Username is required' });
    }

    try {
      const exists = await prisma.user.findFirst({
        where: {
          OR: [
            { username: { equals: username } },
            { email: { equals: email || '' } } // Only checks if email provided
          ]
        }
      });

      if (exists) {
        return res.status(400).json({ success: false, error: 'Username or Email already registered' });
      }

      const hashedPassword = await bcrypt.hash(password || '123456', 10);
      const newUser = await prisma.user.create({
        data: {
          username,
          email: email || `${username}@playusdt.domain`,
          password: hashedPassword,
          balance: 500.0,
          walletAddress: walletAddress || 'T' + Math.random().toString(36).substring(2, 11).toUpperCase() + 'usdtTRC20'
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
    const { userId, amount } = req.body;
    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data: { balance: Math.max(0, parseFloat(amount.toFixed(2))) }
      });
      res.json({ success: true, user: { id: user.id, username: user.username, balance: user.balance } });
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

  app.post('/api/laravel/escrow/payout', async (req, res) => {
    const { escrowId, winnerId, loserId, commissionRate = 0.05 } = req.body;
    try {
      const responseData = await prisma.$transaction(async (tx) => {
        const esc = await tx.escrow.findFirst({ where: { id: escrowId, status: 'locked' } });
        if (!esc) throw new Error('Invalid or already processed Escrow transaction.');

        const originalWinner = await tx.user.findUnique({ where: { id: winnerId } });
        if (!originalWinner) throw new Error('Winner not found.');
        
        const originalLoser = await tx.user.findUnique({ where: { id: loserId } });

        const totalPot = esc.amountEach * 2;
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
    try {
      const tx = await prisma.cryptoTransaction.create({
        data: { userId, type: 'DEPOSIT', amount, txHash, status: 'COMPLETED' }
      });
      const user = await prisma.user.update({
        where: { id: userId },
        data: { balance: { increment: amount } }
      });
      res.json({ success: true, transaction: tx, newBalance: user.balance });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  app.post('/api/laravel/crypto/withdraw', async (req, res) => {
    const { userId, amount, address } = req.body;
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
