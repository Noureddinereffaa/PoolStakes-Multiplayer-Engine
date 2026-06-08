// ─── Shared types for all PoolTable sub-modules ──────────────────────────────

import { Ball, RoomState } from '../../types';

export interface PoolTableProps {
  roomState: RoomState;
  onShoot: (angle: number, power: number, spinX: number, spinY: number) => void;
  onResetCueBall: (x: number, y: number) => void;
  myPlayerId: string;
  isMyTurn: boolean;
  physicsFrames: Array<Array<{ id: number; x: number; y: number; isPocketed: boolean }>> | null;
  onClearFrames: () => void;
  opponentAim?: { angle: number; power: number; spinX?: number; spinY?: number } | null;
  onPreviewAim?: (angle: number, power: number, spinX: number, spinY: number) => void;
  onJoinAI?: (difficulty?: 'easy' | 'medium' | 'hard') => void;
}

export interface StrikeAnim {
  active: boolean;
  power: number;
  startTime: number;
  angle: number;
  duration: number;
  hasStruck?: boolean;
}

export interface BallRotation {
  ux?: number[];
  uy?: number[];
  uz?: number[];
  angle: number;
  pitch: number;
  yaw: number;
}

export interface Ripple {
  x: number; y: number;
  radius: number; maxRadius: number;
  opacity: number; color: string;
}

export interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  size: number; opacity: number;
  color: string;
}

export interface DustSpeck {
  x: number; y: number;
  vx: number; vy: number;
  radius: number; alpha: number; speed: number;
}

export interface SinkingBall {
  id: number;
  ball: Ball;
  progress: number;
  maxProgress: number;
  pocketX: number;
  pocketY: number;
}

// CanvasRefs passed to draw functions
export interface DrawRefs {
  animatedBalls: Ball[];
  roomState: RoomState;
  myPlayerId: string;
  aimAngle: number;
  shotPower: number;
  spinX: number;
  spinY: number;
  isMyTurn: boolean;
  isAnimating: boolean;
  isScratchPlacing: boolean;
  placedPos: { x: number; y: number };
  isPulling: boolean;
  difficulty: 'easy' | 'medium' | 'hard';
  strikeAnim: StrikeAnim | null;
  turnStartTimestamp: number;
  ballRotations: Record<number, BallRotation>;
  impactShake: number;
  feltRipples: Ripple[];
  chalkParticles: Particle[];
  dustSpecks: DustSpeck[];
  sinkingBalls: SinkingBall[];
  opponentAim?: { angle: number; power: number; spinX?: number; spinY?: number } | null;
}
