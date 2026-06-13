export interface Player {
  id: string;
  username: string;
  walletBalance: number;
  bettingStake: number;
  side?: 'solids' | 'stripes';
  isConnected: boolean;
}

export interface Ball {
  id: number; // 0 is cue ball, 1-7 solids, 8 black, 9-15 stripes
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  isPocketed: boolean;
  sleeping?: boolean; // true = velocity is 0, skip all physics (sleep state)
  type: 'cue' | 'black' | 'solid' | 'stripe';
  color: string;
  number?: number;
  spinX?: number;
  spinY?: number;
}

export interface MatchHistory {
  id: string;
  roomName: string;
  winnerName: string;
  loserName: string;
  stake: number;
  prizeAmount: number;
  commission: number;
  timestamp: string;
  pocketsByWinner: number;
}

export interface RoomState {
  roomId: string;
  name: string;
  stake: number;
  status: 'waiting' | 'ready' | 'playing' | 'gameover' | 'paused' | 'archived';
  players: Player[];
  balls: Ball[];
  currentTurn: string; // active player ID
  winnerId?: string;
  assignedSides: boolean;
  scratchOccurred: boolean;
  pocketedThisTurn: boolean;
  ballInHandRestriction?: 'anywhere' | 'behind_head_string';
  log: string[];
  aiDifficulty?: Difficulty;
  escrowHash?: string;
  serverSeed?: string;
  commissionRate?: number;
  turnTimer?: number; // active player turn timer in seconds (e.g., 40 to 0)
  animVersion?: number; // incremented each shot to invalidate stale timeouts
  disconnectedPlayerIds?: string[]; // players currently disconnected during active game
  reconnectDeadlines?: Record<string, number>; // playerId → deadline timestamp
  forfeitedPlayerId?: string; // player who forfeited by not reconnecting
  roomCode?: string; // short shareable code for private rooms
  isPublic?: boolean; // visible in public room listing
  createdAt?: number; // timestamp for room cleanup
  /** Lifecycle: last time room had active clients. Used for PAUSED→ARCHIVED transition. */
  lastActiveAt?: number;
  /** Indicates this room was restored from DB snapshot (lazy loaded) */
  isRestored?: boolean;
}

export interface GameConfig {
  physicsParams: {
    friction: number;
    rebound: number;
    tableWidth: number;
    tableHeight: number;
  };
}

export type Difficulty = 'easy' | 'medium' | 'hard';

// WebSocket incoming and outgoing message types
export type SocketMessage =
  | { type: 'join'; roomId: string; username: string; stake: number; token?: string }
  | { type: 'reconnect'; token: string }
  | { type: 'leave' }
  | { type: 'preview_aim'; angle: number; power: number; spinX?: number; spinY?: number }
  | { type: 'shoot'; angle: number; power: number; spinX?: number; spinY?: number }
  | { type: 'reset_cue_ball'; x: number; y: number }
  | { type: 'chat'; message: string }
  | { type: 'set_ai_opponent'; difficulty?: Difficulty }
  | { type: 'start_ai_match'; difficulty?: Difficulty; token?: string; username?: string }
  | { type: 'rematch' }
  // Room management messages:
  | { type: 'authenticate'; token?: string }
  | { type: 'create_room'; stake: number; isPublic?: boolean; token?: string }
  | { type: 'list_rooms'; stake?: number }
  | { type: 'join_by_code'; code: string; username: string; token?: string }
  | { type: 'join_random'; stake: number; username: string; token?: string }
  | { type: 'cancel_waiting' }
  | { type: 'ping' }
  | { type: 'pong' }
  // Server to client messages:
  | { type: 'sync_state'; state: RoomState }
  | { type: 'authenticated' }
  | { type: 'room_created'; roomId: string; roomCode: string }
  | { type: 'rooms_list'; rooms: Array<{ roomId: string; roomCode: string; stake: number; players: number; status: string }> }
  | { type: 'join_success'; roomId: string }
  | { type: 'room_not_found'; message: string }
  | { type: 'physics_frames'; frames: Array<{ id: number; x: number; y: number; isPocketed: boolean }[]> }
  | { type: 'disconnect_notice'; playerId: string; deadline: number }
  | { type: 'reconnect_notice'; playerId: string }
  | { type: 'laravel_api_log'; id: string; apiName: string; payload: any; response: any; timestamp: string }
  | { type: 'event_log'; event: string; data?: any }
  | { type: 'error'; message: string };
