export interface BallRotationData {
  ux: number[];
  uy: number[];
  uz: number[];
  angle: number;
  pitch: number;
  yaw: number;
}

export function createBallRotation(): BallRotationData {
  return {
    ux: [1, 0, 0],
    uy: [0, 1, 0],
    uz: [0, 0, 1],
    angle: 0,
    pitch: 0,
    yaw: 0,
  };
}

function rotateUnitVector(v: number[], ax: number, ay: number, az: number, dTheta: number): number[] {
  const c = Math.cos(dTheta);
  const s = Math.sin(dTheta);
  const dot = v[0] * ax + v[1] * ay + v[2] * az;
  const cx = ay * v[2] - az * v[1];
  const cy = az * v[0] - ax * v[2];
  const cz = ax * v[1] - ay * v[0];

  const rx = v[0] * c + cx * s + ax * dot * (1 - c);
  const ry = v[1] * c + cy * s + ay * dot * (1 - c);
  const rz = v[2] * c + cz * s + az * dot * (1 - c);

  const len = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
  return [rx / len, ry / len, rz / len];
}

export function updateBallRotation(
  rot: BallRotationData,
  dx: number,
  dy: number,
  radius: number
): void {
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist <= 0.04) return;

  const R = radius || 10;
  const dTheta = dist / R;

  const ax = -dy / dist;
  const ay = dx / dist;
  const az = 0;

  rot.ux = rotateUnitVector(rot.ux, ax, ay, az, dTheta);
  rot.uy = rotateUnitVector(rot.uy, ax, ay, az, dTheta);
  rot.uz = rotateUnitVector(rot.uz, ax, ay, az, dTheta);

  rot.angle += dist * 0.12;
  rot.pitch += dy * 0.12;
  rot.yaw += dx * 0.12;
}
