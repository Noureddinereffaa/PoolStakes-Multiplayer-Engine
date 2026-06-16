import { RoomState } from '../types';

export type SafeFrame = {
  roomId: string;
  name: string;
  stake: number;
  status: 'waiting' | 'ready' | 'playing' | 'gameover' | 'paused' | 'archived';
  players: NonNullable<RoomState['players']>;
  balls: NonNullable<RoomState['balls']>;
  currentTurn: string;
  winnerId?: string;
  assignedSides: boolean;
  scratchOccurred: boolean;
  pocketedThisTurn: boolean;
  ballInHandRestriction?: 'anywhere' | 'behind_head_string';
  log: NonNullable<RoomState['log']>;
  aiDifficulty?: RoomState['aiDifficulty'];
  escrowHash?: string;
  serverSeed?: string;
  commissionRate?: number;
  turnTimer?: number;
  animVersion?: number;
  disconnectedPlayerIds?: string[];
  reconnectDeadlines?: Record<string, number>;
  forfeitedPlayerId?: string;
  roomCode?: string;
  isPublic?: boolean;
  createdAt?: number;
  lastActiveAt?: number;
  isRestored?: boolean;
  calledPocketId?: number | null;
};

export function getSafeFrame(roomState: RoomState | null): SafeFrame | null {
  if (!roomState) return null;
  return {
    ...roomState,
    players: roomState.players ?? [],
    balls: roomState.balls ?? [],
    log: roomState.log ?? [],
    status: roomState.status || 'waiting',
  };
}
