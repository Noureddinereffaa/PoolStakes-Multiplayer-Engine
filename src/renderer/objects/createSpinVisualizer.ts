import * as THREE from 'three';
import { RenderService } from '../RenderService';
import { SceneGroup } from '../types';
import { SPIN, aimDir, perpDir } from './mapSpinToVisuals';

export interface SpinVisualizerController {
  update(
    aimAngle: number,
    spinX: number,
    spinY: number,
    cueBallPos: THREE.Vector3,
  ): void;
  show(): void;
  hide(): void;
  dispose(): void;
}

const _up = new THREE.Vector3(0, 1, 0);

function makeArrow(
  color: number,
  headLength: number,
  headWidth: number,
): THREE.ArrowHelper {
  const dir = new THREE.Vector3(1, 0, 0);
  return new THREE.ArrowHelper(dir, new THREE.Vector3(), 1, color, headLength, headWidth);
}

export function createSpinVisualizer(rs: RenderService): SpinVisualizerController {
  const group = rs.getSceneGroup(SceneGroup.Balls);
  if (!group) throw new Error('BallGroup not found');

  const container = new THREE.Group();
  container.name = 'SpinVisualizer';
  container.visible = false;

  const longArrow = makeArrow(0x44FF44, 3, 2);
  longArrow.name = 'LongArrow';
  longArrow.setLength(1);

  const latArrow = makeArrow(0x4488FF, 3, 2);
  latArrow.name = 'LatArrow';
  latArrow.setLength(1);

  const curvePts: THREE.Vector3[] = [];
  for (let i = 0; i < 20; i++) {
    curvePts.push(new THREE.Vector3());
  }
  const curveGeo = new THREE.BufferGeometry().setFromPoints(curvePts);
  const curveMat = new THREE.LineBasicMaterial({
    color: 0xAA44FF,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  const curveLine = new THREE.Line(curveGeo, curveMat);
  curveLine.name = 'CurveArc';

  container.add(longArrow);
  container.add(latArrow);
  container.add(curveLine);
  group.add(container);

  const _pathTemp: THREE.Vector3[] = [];

  const controller: SpinVisualizerController = {
    show: () => { container.visible = true; },
    hide: () => { container.visible = false; },
    update: (aimAngle: number, spinX: number, spinY: number, cueBallPos: THREE.Vector3) => {
      if (!container.visible) return;

      const origin = cueBallPos.clone();
      origin.y += 14;
      container.position.copy(origin);

      const dir = aimDir(aimAngle);
      const perp = perpDir(aimAngle);
      const dVec = new THREE.Vector3(dir.x, 0, dir.z).normalize();
      const pVec = new THREE.Vector3(perp.x, 0, perp.z).normalize();

      const longLen = Math.abs(spinY) * SPIN.ARROW_LONG_SCALE;
      if (longLen > 0.5) {
        longArrow.visible = true;
        longArrow.setDirection(dVec);
        longArrow.setLength(longLen, 3, 2);
        const c = spinY >= 0 ? 0x44FF44 : 0xFF4444;
        longArrow.setColor(new THREE.Color(c));
      } else {
        longArrow.visible = false;
      }

      const latLen = Math.abs(spinX) * SPIN.ARROW_LAT_SCALE;
      if (latLen > 0.5) {
        latArrow.visible = true;
        const sign = spinX > 0 ? 1 : -1;
        latArrow.setDirection(pVec.clone().multiplyScalar(sign));
        latArrow.setLength(latLen, 3, 2);
      } else {
        latArrow.visible = false;
      }

      if (Math.abs(spinX) > 0.02 || Math.abs(spinY) > 0.02) {
        curveLine.visible = true;
        const steps = 16;
        const baseSpeed = 600;
        const dt = 0.015;
        const pos = cueBallPos.clone();
        const vel = new THREE.Vector3(dir.x, 0, dir.z).multiplyScalar(baseSpeed);

        _pathTemp.length = 0;
        _pathTemp.push(pos.clone());

        for (let i = 0; i < steps; i++) {
          const speed = vel.length();
          if (speed < 1) break;

          const ux = vel.x / speed;
          const uz = vel.z / speed;
          const px = -uz;
          const pz = ux;

          vel.x += px * spinX * SPIN.CURVE_FACTOR * dt;
          vel.z += pz * spinX * SPIN.CURVE_FACTOR * dt;
          vel.x += ux * spinY * SPIN.LONG_FACTOR * dt;
          vel.z += uz * spinY * SPIN.LONG_FACTOR * dt;

          if (Math.abs(spinX) > SPIN.SWERVE_THRESHOLD) {
            const swerveMag = SPIN.SWERVE_FACTOR * (Math.abs(spinX) - SPIN.SWERVE_THRESHOLD) * Math.sign(spinX);
            vel.x += px * swerveMag * dt;
            vel.z += pz * swerveMag * dt;
          }

          pos.x += vel.x * dt;
          pos.z += vel.z * dt;
          pos.y = cueBallPos.y;

          if (pos.x < -370 || pos.x > 370 || pos.z < -170 || pos.z > 170) break;

          _pathTemp.push(pos.clone());
        }

        const curve = new THREE.CatmullRomCurve3(_pathTemp);
        const pts = curve.getPoints(18);
        const posAttr = curveLine.geometry.attributes.position;
        for (let i = 0; i < Math.min(pts.length, 19); i++) {
          posAttr.array[i * 3] = -container.position.x + pts[i].x;
          posAttr.array[i * 3 + 1] = -container.position.y + pts[i].y;
          posAttr.array[i * 3 + 2] = -container.position.z + pts[i].z;
        }
        posAttr.needsUpdate = true;
        posAttr.count = pts.length;
        curveLine.geometry.setDrawRange(0, pts.length);
      } else {
        curveLine.visible = false;
      }
    },
    dispose: () => {
      group.remove(container);
      curveGeo.dispose();
      curveMat.dispose();
      // ArrowHelper internals: each has a Line (cone) + Mesh (shaft)
      [longArrow, latArrow].forEach(arrow => {
        arrow.line?.geometry?.dispose();
        (arrow.line?.material as THREE.Material)?.dispose();
        arrow.cone?.geometry?.dispose();
        (arrow.cone?.material as THREE.Material)?.dispose();
      });
    },
  };

  return controller;
}
