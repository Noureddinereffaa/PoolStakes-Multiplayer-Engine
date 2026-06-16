import * as THREE from 'three';

export enum GameEvent {
  SHOT_START = 'SHOT_START',
  SHOT_END = 'SHOT_END',
  CUE_IMPACT = 'CUE_IMPACT',
  BALL_COLLISION = 'BALL_COLLISION',
  BALL_POCKET = 'BALL_POCKET',
  TURN_CHANGE = 'TURN_CHANGE',
  GAMEOVER = 'GAMEOVER',
}

export interface ShotStartPayload {
  cueAngle: number;
  power: number;
  spinX: number;
  spinY: number;
  cueBallPos: THREE.Vector3;
  timestamp: number;
}

export interface ShotEndPayload {
  totalCollisions: number;
  pocketedBalls: number[];
  duration: number;
  timestamp: number;
}

export interface CueImpactPayload {
  power: number;
  position: THREE.Vector3;
  timestamp: number;
}

export interface BallCollisionPayload {
  position: THREE.Vector3;
  speed: number;
  ballIds: [number, number];
  timestamp: number;
}

export interface BallPocketPayload {
  ballId: number;
  position: THREE.Vector3;
  timestamp: number;
}

export interface TurnChangePayload {
  playerId: string;
  previousPlayerId: string;
  timestamp: number;
}

export interface GameoverPayload {
  winnerId: string;
  winnerName: string;
  timestamp: number;
}

export type GameEventPayloadMap = {
  [GameEvent.SHOT_START]: ShotStartPayload;
  [GameEvent.SHOT_END]: ShotEndPayload;
  [GameEvent.CUE_IMPACT]: CueImpactPayload;
  [GameEvent.BALL_COLLISION]: BallCollisionPayload;
  [GameEvent.BALL_POCKET]: BallPocketPayload;
  [GameEvent.TURN_CHANGE]: TurnChangePayload;
  [GameEvent.GAMEOVER]: GameoverPayload;
};
