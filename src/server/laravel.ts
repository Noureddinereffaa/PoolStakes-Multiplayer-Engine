import { Express } from 'express';
import { WebSocket } from 'ws';

export interface LaravelUser {
  id: string;
  username: string;
  balance: number;
  email?: string;
  password?: string;
  walletAddress?: string;
}

export interface EscrowTx {
  escrowId: string;
  roomName: string;
  player1Id: string;
  player2Id: string;
  amountEach: number;
  status: 'locked' | 'refunded' | 'payout_completed';
}

export interface LaravelDb {
  users: LaravelUser[];
  escrows: EscrowTx[];
  transactions: any[];
  apiLogs: any[];
}

export const laravelDb: LaravelDb = {
  users: [
    { id: 'usr-1', username: 'mohawkbigger', balance: 500.0 },
    { id: 'usr-2', username: 'PoolMaster99', balance: 350.0 },
    { id: 'ai-bot', username: 'Authoritative_AI_Bot', balance: 9999.0 }
  ],
  escrows: [],
  transactions: [],
  apiLogs: []
};

export function logLaravelApi(broadcastToAllWebSockets: (messageObj: any) => void, apiName: string, reqBody: any, response: any) {
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

export function registerLaravelRoutes(app: Express, broadcastToAllWebSockets: (messageObj: any) => void) {
  const logLocalLaravelApi = (apiName: string, reqBody: any, response: any) =>
    logLaravelApi(broadcastToAllWebSockets, apiName, reqBody, response);

  app.get('/api/laravel/users', (req, res) => {
    res.json({ users: laravelDb.users });
  });

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
      balance: 500.0,
      walletAddress: walletAddress || 'T' + Math.random().toString(36).substring(2, 11).toUpperCase() + 'usdtTRC20'
    };

    laravelDb.users.push(newUser);
    logLocalLaravelApi('POST /api/laravel/auth/register', { username, email, walletAddress }, { success: true, userId: newUser.id, balance: newUser.balance });
    res.json({ success: true, user: newUser });
  });

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
    const correctPassword = user.password || '123456';
    if (correctPassword !== password) {
      return res.status(401).json({ success: false, error: 'Invalid password credentials' });
    }
    logLocalLaravelApi('POST /api/laravel/auth/login', { username }, { success: true, userId: user.id });
    res.json({ success: true, user });
  });

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

  app.post('/api/laravel/escrow/lock', (req, res) => {
    const { roomName, player1Id, player2Id, stake } = req.body;
    const u1 = laravelDb.users.find(u => u.id === player1Id);
    const u2 = laravelDb.users.find(u => u.id === player2Id);
    if (!u1 || !u2) {
      const err = { error: 'One or both players do not exist in database.' };
      logLocalLaravelApi('POST /api/laravel/escrow/lock', req.body, err);
      return res.status(400).json(err);
    }
    if (u1.balance < stake || u2.balance < stake) {
      const err = { error: 'Insufficient funds in player account wallet.' };
      logLocalLaravelApi('POST /api/laravel/escrow/lock', req.body, err);
      return res.status(400).json(err);
    }
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
    logLocalLaravelApi('POST /api/laravel/escrow/lock', req.body, successResponse);
    res.json(successResponse);
  });

  app.post('/api/laravel/escrow/payout', (req, res) => {
    const { escrowId, winnerId, loserId, commissionRate = 0.05 } = req.body;
    const esc = laravelDb.escrows.find(e => e.escrowId === escrowId && e.status === 'locked');
    if (!esc) {
      const err = { error: 'Invalid or already processed Escrow transaction.' };
      logLocalLaravelApi('POST /api/laravel/escrow/payout', req.body, err);
      return res.status(400).json(err);
    }
    const originalWinner = laravelDb.users.find(u => u.id === winnerId);
    const originalLoser = laravelDb.users.find(u => u.id === loserId);
    if (!originalWinner) {
      const err = { error: 'Winner not found.' };
      logLocalLaravelApi('POST /api/laravel/escrow/payout', req.body, err);
      return res.status(400).json(err);
    }
    const totalPot = esc.amountEach * 2;
    const commission = Math.round(totalPot * commissionRate * 100) / 100;
    const prize = totalPot - commission;
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
    logLocalLaravelApi('POST /api/laravel/escrow/payout', req.body, responseData);
    res.json(responseData);
  });

  app.get('/api/laravel/logs', (req, res) => {
    res.json({ logs: laravelDb.apiLogs });
  });
}
