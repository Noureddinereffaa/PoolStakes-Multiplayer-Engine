import { RoomState, Player } from '../types';
import { LaravelUser, laravelDb, logLaravelApi } from './laravel';
import { broadcastToAllWebSockets } from './state';

export function ensureLaravelUser(username: string): LaravelUser {
  let walletUser = laravelDb.users.find(u => u.username === username);
  if (!walletUser) {
    const generatedId = `usr-${Date.now()}`;
    walletUser = { id: generatedId, username, balance: 500.0 };
    laravelDb.users.push(walletUser);
  }
  return walletUser;
}

export function createPlayerFromUser(user: LaravelUser, stake: number): Player {
  return {
    id: user.id,
    username: user.username,
    walletBalance: user.balance,
    bettingStake: stake,
    isConnected: true
  };
}

export function ensureMinimumBalance(user: LaravelUser, minimum: number) {
  if (user.balance < minimum) {
    user.balance = minimum;
  }
}

export function getAiUser(): LaravelUser {
  let ai = laravelDb.users.find(u => u.id === 'ai-bot');
  if (!ai) {
    ai = { id: 'ai-bot', username: 'Authoritative_AI_Bot', balance: 10000.0 };
    laravelDb.users.push(ai);
  }
  return ai;
}

export function createAiPlayer(diffLevel: string, stake: number): Player {
  return {
    id: 'ai-bot',
    username: `Bot_${diffLevel.toUpperCase()}`,
    walletBalance: 10000.0,
    bettingStake: stake,
    isConnected: true
  };
}

export function lockRoomEscrow(room: RoomState, apiName: string, reqPayload: any) {
  const player1 = laravelDb.users.find(u => u.id === room.players[0]?.id);
  const player2 = laravelDb.users.find(u => u.id === room.players[1]?.id);
  if (!player1 || !player2) {
    const response = { success: false, message: 'One or both escrow participants are missing.' };
    logLaravelApi(broadcastToAllWebSockets, apiName, reqPayload, response);
    return { success: false, message: response.message };
  }

  if (player1.balance < room.stake || player2.balance < room.stake) {
    const response = { success: false, message: 'Insufficient funds in one or both player wallets.' };
    logLaravelApi(broadcastToAllWebSockets, apiName, reqPayload, response);
    return { success: false, message: response.message };
  }

  player1.balance -= room.stake;
  player2.balance -= room.stake;
  room.players[0].walletBalance = player1.balance;
  room.players[1].walletBalance = player2.balance;

  const escrowId = `escrow-${Math.floor(Math.random() * 89999 + 10000)}`;
  const escrowHash = `HASH-${Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('').toUpperCase()}`;
  laravelDb.escrows.push({
    escrowId,
    roomName: room.name,
    player1Id: player1.id,
    player2Id: player2.id,
    amountEach: room.stake,
    status: 'locked'
  });

  room.escrowHash = escrowHash;
  room.log.push(`Escrow successfully locked: Balance check verified. Transaction ID: ${escrowId}`);
  room.status = 'playing';
  room.currentTurn = room.players[0].id;

  const response = {
    success: true,
    escrowId,
    escrowHash,
    lockedAmount: room.stake * 2,
    balances: { [player1.id]: player1.balance, [player2.id]: player2.balance }
  };
  logLaravelApi(broadcastToAllWebSockets, apiName, reqPayload, response);

  return { success: true, escrowId, escrowHash };
}
