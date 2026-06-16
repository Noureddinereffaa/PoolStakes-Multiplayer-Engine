import { SnapshotBall } from '../renderer/objects/createBalls';
import { GameRenderMode } from './GameRenderMode';
import { setReplayActive } from '../utils/replayGuard';

export interface ReplayFrame {
  balls: SnapshotBall[];
}

const FIXED_STEP = 1 / 60;

export class ReplayController {
  private _frames: ReplayFrame[] = [];
  private _currentIndex = 0;
  private _accumulator = 0;
  private _mode: GameRenderMode = 'IDLE';
  private _onComplete: (() => void) | null = null;
  private _updateBall: ((snapshot: SnapshotBall[]) => void) | null = null;

  get mode(): GameRenderMode {
    return this._mode;
  }

  get isPlaying(): boolean {
    return this._mode === 'REPLAY';
  }

  start(
    frames: ReplayFrame[],
    onUpdateBall: (snapshot: SnapshotBall[]) => void,
    onComplete: () => void,
  ): void {
    if (frames.length < 2) {
      onComplete();
      return;
    }

    this._frames = frames;
    this._currentIndex = 0;
    this._accumulator = 0;
    this._mode = 'REPLAY';
    this._updateBall = onUpdateBall;
    this._onComplete = onComplete;

    setReplayActive(true);
    this.applyFrame(0, 0);
  }

  tick(dt: number): void {
    if (this._mode !== 'REPLAY') return;

    if (this._currentIndex >= this._frames.length - 1) {
      this.finish();
      return;
    }

    this._accumulator += dt;

    let advanced = false;
    while (this._accumulator >= FIXED_STEP) {
      this._accumulator -= FIXED_STEP;
      this._currentIndex++;
      advanced = true;
      if (this._currentIndex >= this._frames.length - 1) {
        this.finish();
        return;
      }
    }

    if (advanced) {
      const alpha = this._accumulator / FIXED_STEP;
      this.interpolateAndApply(this._currentIndex, alpha);
    }
  }

  stop(): void {
    if (this._mode !== 'REPLAY') return;
    this._mode = 'IDLE';
    this._frames = [];
    this._currentIndex = 0;
    this._accumulator = 0;
    this._updateBall = null;
    setReplayActive(false);
    const cb = this._onComplete;
    this._onComplete = null;
    cb?.();
  }

  private finish(): void {
    this.applyFrame(this._frames.length - 1, 1);
    this._mode = 'IDLE';
    this._frames = [];
    this._currentIndex = 0;
    this._accumulator = 0;
    this._updateBall = null;
    setReplayActive(false);
    const cb = this._onComplete;
    this._onComplete = null;
    cb?.();
  }

  private applyFrame(frameIndex: number, alpha: number): void {
    if (frameIndex >= this._frames.length) return;
    this.interpolateAndApply(frameIndex, alpha);
  }

  private interpolateAndApply(frameIndex: number, alpha: number): void {
    const frameA = this._frames[frameIndex];
    const frameB = this._frames[Math.min(frameIndex + 1, this._frames.length - 1)];
    if (!frameA || !frameB) return;

    const snapshot: SnapshotBall[] = frameA.balls.map(ballA => {
      const ballB = frameB.balls.find(b => b.id === ballA.id) ?? ballA;
      return {
        id: ballA.id,
        x: ballA.x + (ballB.x - ballA.x) * alpha,
        y: ballA.y + (ballB.y - ballA.y) * alpha,
        isPocketed: alpha < 0.5 ? ballA.isPocketed : ballB.isPocketed,
      };
    });

    this._updateBall?.(snapshot);
  }
}
