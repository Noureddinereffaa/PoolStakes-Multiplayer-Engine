import { CameraState } from '../camera/createCinematicCamera';
import { DirectorAI, CameraHint } from './DirectorAI';

const HINT_TO_CAMERA_STATE: Record<string, CameraState> = {
  [CameraHint.WIDE_ESTABLISHING]: CameraState.BROADCAST_IDLE,
  [CameraHint.FOLLOW_CUE]: CameraState.BALL_TRACKING,
  [CameraHint.IMPACT_DRAMA]: CameraState.IMPACT_REACTION,
  [CameraHint.CROWD_REACTION]: CameraState.BROADCAST_IDLE,
  [CameraHint.REPLAY_SUGGEST]: CameraState.BROADCAST_IDLE,
};

export interface CameraHintIntegration {
  pollHint(dt: number): CameraState | null;
}

export function createCameraHintIntegration(director: DirectorAI): CameraHintIntegration {
  return {
    pollHint: (dt: number): CameraState | null => {
      director.update(dt);
      const hint = director.consumeHint();
      if (!hint) return null;
      return HINT_TO_CAMERA_STATE[hint] ?? null;
    },
  };
}
