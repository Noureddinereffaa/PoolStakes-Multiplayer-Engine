import * as THREE from 'three';
import { SnapshotBall } from '../objects/createBalls';
import { CollisionEvent } from '../camera/createCinematicCamera';

export interface ReplayFrame {
  t: number;
  snapshot: SnapshotBall[];
}

export interface ReplayShotData {
  cueAngle: number;
  spinX: number;
  spinY: number;
  power: number;
  frames: ReplayFrame[];
  collisions: CollisionEvent[];
  duration: number;
}

export interface ReplayRecorder {
  startShot(params: {
    cueAngle: number; spinX: number; spinY: number; power: number;
  }): void;
  recordFrame(snapshot: SnapshotBall[], dt: number): void;
  recordCollision(event: CollisionEvent): void;
  endShot(): ReplayShotData | null;
  isRecording(): boolean;
  clear(): void;
  dispose(): void;
}

const _colEvent: CollisionEvent = { position: new THREE.Vector3(), normal: new THREE.Vector3(), time: 0 };

export function createReplayRecorder(): ReplayRecorder {
  let recording = false;
  let cueAngle = 0;
  let spinX = 0;
  let spinY = 0;
  let power = 0;
  let recordingTime = 0;
  const frames: ReplayFrame[] = [];
  const collisions: CollisionEvent[] = [];

  const _tmpSnapshot: SnapshotBall[] = [];

  return {
    isRecording: () => recording,

    clear: () => {
      frames.length = 0;
      collisions.length = 0;
      recordingTime = 0;
      recording = false;
    },

    startShot: (params) => {
      frames.length = 0;
      collisions.length = 0;
      recordingTime = 0;
      cueAngle = params.cueAngle;
      spinX = params.spinX;
      spinY = params.spinY;
      power = params.power;
      recording = true;
    },

    recordFrame: (snapshot: SnapshotBall[], dt: number) => {
      if (!recording) return;
      recordingTime += dt;
      _tmpSnapshot.length = snapshot.length;
      for (let i = 0; i < snapshot.length; i++) {
        _tmpSnapshot[i] = { ...snapshot[i] };
      }
      frames.push({ t: recordingTime, snapshot: _tmpSnapshot.slice() });
    },

    recordCollision: (event: CollisionEvent) => {
      if (!recording) return;
      _colEvent.position.copy(event.position);
      _colEvent.normal.copy(event.normal);
      _colEvent.time = recordingTime;
      collisions.push({
        position: _colEvent.position.clone(),
        normal: _colEvent.normal.clone(),
        time: _colEvent.time,
      });
    },

    endShot: () => {
      if (!recording || frames.length < 2) {
        recording = false;
        return null;
      }
      recording = false;
      return {
        cueAngle,
        spinX,
        spinY,
        power,
        frames: frames.slice(),
        collisions: collisions.slice(),
        duration: recordingTime,
      };
    },

    dispose: () => {
      frames.length = 0;
      collisions.length = 0;
      recording = false;
    },
  };
}
