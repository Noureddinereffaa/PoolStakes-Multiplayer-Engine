export enum CameraHint {
  WIDE_ESTABLISHING = 'WIDE_ESTABLISHING',
  FOLLOW_CUE = 'FOLLOW_CUE',
  IMPACT_DRAMA = 'IMPACT_DRAMA',
  CROWD_REACTION = 'CROWD_REACTION',
  REPLAY_SUGGEST = 'REPLAY_SUGGEST',
}

export interface DirectorAIConfig {
  minHoldDuration: number;
  importanceThresholds: {
    medium: number;
    high: number;
    veryHigh: number;
  };
}

const DEFAULT_CONFIG: DirectorAIConfig = {
  minHoldDuration: 1.2,
  importanceThresholds: {
    medium: 0.3,
    high: 0.6,
    veryHigh: 0.85,
  },
};

export interface ShotImportanceInput {
  power: number;
  spinIntensity: number;
  collisionCount: number;
  pocketProbability: number;
}

export interface DirectorAI {
  evaluateImportance(input: ShotImportanceInput): number;
  getCurrentHint(): CameraHint;
  consumeHint(): CameraHint | null;
  reset(): void;
  forceHint(hint: CameraHint): void;
  update(dt: number): void;
}

export function createDirectorAI(config?: Partial<DirectorAIConfig>): DirectorAI {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let currentHint: CameraHint = CameraHint.WIDE_ESTABLISHING;
  let holdTimer = 0;
  let pendingHint: CameraHint | null = null;

  function evaluateImportance(input: ShotImportanceInput): number {
    const powerScore = Math.min(1, input.power / 100) * 0.3;
    const spinScore = Math.min(1, input.spinIntensity) * 0.2;
    const collisionScore = Math.min(1, input.collisionCount / 10) * 0.3;
    const pocketScore = Math.min(1, input.pocketProbability) * 0.2;
    return Math.min(1, powerScore + spinScore + collisionScore + pocketScore);
  }

  function importanceToHint(importance: number): CameraHint {
    if (importance >= cfg.importanceThresholds.veryHigh) {
      return CameraHint.REPLAY_SUGGEST;
    }
    if (importance >= cfg.importanceThresholds.high) {
      return CameraHint.IMPACT_DRAMA;
    }
    if (importance >= cfg.importanceThresholds.medium) {
      return CameraHint.FOLLOW_CUE;
    }
    return CameraHint.WIDE_ESTABLISHING;
  }

  return {
    evaluateImportance,

    getCurrentHint: () => currentHint,

    consumeHint: () => {
      if (pendingHint) {
        const hint = pendingHint;
        pendingHint = null;
        return hint;
      }
      return null;
    },

    reset: () => {
      currentHint = CameraHint.WIDE_ESTABLISHING;
      pendingHint = null;
      holdTimer = 0;
    },

    forceHint: (hint: CameraHint) => {
      pendingHint = hint;
      holdTimer = 0;
    },

    update: (dt: number) => {
      holdTimer += dt;
      if (pendingHint && holdTimer >= cfg.minHoldDuration) {
        currentHint = pendingHint;
        pendingHint = null;
        holdTimer = 0;
      }
    },
  };
}
