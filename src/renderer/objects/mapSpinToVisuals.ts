import * as THREE from 'three';

export const SPIN = {
  CURVE_FACTOR: 20,
  LONG_FACTOR: 100,
  SWERVE_FACTOR: 1,
  SWERVE_THRESHOLD: 0.3,
  ARROW_LONG_SCALE: 14,
  ARROW_LAT_SCALE: 10,
  ARROW_ARC_SCALE: 12,
} as const;

export function spinLongColor(spinY: number): THREE.Color {
  return spinY >= 0 ? new THREE.Color(0x44FF44) : new THREE.Color(0xFF4444);
}

export function spinLongLabel(spinY: number): string {
  if (spinY > 0.05) return 'follow';
  if (spinY < -0.05) return 'draw';
  return '';
}

export function spinLatLabel(spinX: number): string {
  if (Math.abs(spinX) < 0.05) return '';
  return spinX > 0 ? 'right' : 'left';
}

export function aimDir(angle: number): { x: number; z: number } {
  return { x: Math.cos(angle), z: -Math.sin(angle) };
}

export function perpDir(angle: number): { x: number; z: number } {
  return { x: Math.sin(angle), z: Math.cos(angle) };
}
