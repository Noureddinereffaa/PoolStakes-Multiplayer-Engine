export const GameRenderMode = {
  LIVE: 'LIVE',
  REPLAY: 'REPLAY',
  IDLE: 'IDLE',
} as const;

export type GameRenderMode = (typeof GameRenderMode)[keyof typeof GameRenderMode];
