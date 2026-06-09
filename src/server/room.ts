import crypto from 'crypto';
import { RoomState, Player } from '../types';
import { logLaravelApi } from './laravel';
import { broadcastToAllWebSockets, pushRoomLog } from './state';
import { prisma } from './db';
import type { User } from '@prisma/client';

export async function ensureLaravelUser(username: string): Promise<User> {
  let user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        username,
        password: 'default_password',
        balance: 500.0
      }
    });
  }
  return user;
}

export function createPlayerFromUser(user: User, stake: number): Player {
  return {
    id: user.id,
    username: user.username,
    walletBalance: user.balance,
    bettingStake: stake,
    isConnected: true
  };
}

export async function ensureMinimumBalance(userId: string, minimum: number): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user && user.balance < minimum) {
    await prisma.user.update({ where: { id: userId }, data: { balance: minimum } });
  }
}

export async function getAiUser(): Promise<User> {
  let ai = await prisma.user.findUnique({ where: { id: 'ai-bot' } });
  if (!ai) {
    ai = await prisma.user.create({
      data: {
        id: 'ai-bot',
        username: 'Authoritative_AI_Bot',
        password: 'ai-password',
        balance: 10000.0
      }
    });
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

export async function lockRoomEscrow(room: RoomState, apiName: string, reqPayload: any): Promise<{ success: boolean; escrowId?: string; escrowHash?: string; message?: string }> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const p1 = await tx.user.findUnique({ where: { id: room.players[0]?.id } });
      const p2 = await tx.user.findUnique({ where: { id: room.players[1]?.id } });

      if (!p1 || !p2) throw new Error('One or both escrow participants are missing.');
      if (p1.balance < room.stake || p2.balance < room.stake) throw new Error('Insufficient funds in one or both player wallets.');

      const updatedP1 = await tx.user.update({ where: { id: p1.id }, data: { balance: { decrement: room.stake } } });
      const updatedP2 = await tx.user.update({ where: { id: p2.id }, data: { balance: { decrement: room.stake } } });

      const escrow = await tx.escrow.create({
        data: {
          roomName: room.name,
          player1Id: p1.id,
          player2Id: p2.id,
          amountEach: room.stake,
          status: 'locked'
        }
      });

      return { escrowId: escrow.id, balances: { [p1.id]: updatedP1.balance, [p2.id]: updatedP2.balance } };
    });

    room.players[0].walletBalance = result.balances[room.players[0].id];
    room.players[1].walletBalance = result.balances[room.players[1].id];

    const serverSeed = crypto.randomBytes(32).toString('hex');
    const escrowHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
    room.serverSeed = serverSeed;
    room.escrowHash = escrowHash;
    pushRoomLog(room, `Escrow successfully locked: Balance check verified. Transaction ID: ${result.escrowId}`);
    room.status = 'playing';
    room.currentTurn = room.players[0].id;

    const response = {
      success: true,
      escrowId: result.escrowId,
      escrowHash,
      lockedAmount: room.stake * 2,
      balances: result.balances
    };
    logLaravelApi(broadcastToAllWebSockets, apiName, reqPayload, response);

    return { success: true, escrowId: result.escrowId, escrowHash };
  } catch (error: any) {
    logLaravelApi(broadcastToAllWebSockets, apiName, reqPayload, { success: false, message: error.message });
    return { success: false, message: error.message };
  }
}
