export type ConnectionGrade = 'excellent' | 'good' | 'poor' | 'dead';

export interface ConnectionMetrics {
  rtt: number;
  grade: ConnectionGrade;
  packetLoss: number;
  jitter: number;
  timestamp: number;
}

const RTT_SAMPLES: number[] = [];
const MAX_SAMPLES = 10;
let lastPingTime = 0;
let packetsSent = 0;
let packetsAcked = 0;

export function markPingSent(): void {
  lastPingTime = performance.now();
  packetsSent++;
}

export function markPongReceived(): void {
  if (lastPingTime > 0) {
    const rtt = performance.now() - lastPingTime;
    RTT_SAMPLES.push(rtt);
    if (RTT_SAMPLES.length > MAX_SAMPLES) RTT_SAMPLES.shift();
    packetsAcked++;
  }
}

export function getAverageRTT(): number {
  if (RTT_SAMPLES.length === 0) return 0;
  return RTT_SAMPLES.reduce((a, b) => a + b, 0) / RTT_SAMPLES.length;
}

export function getPacketLoss(): number {
  if (packetsSent === 0) return 0;
  return Math.min(1, Math.max(0, 1 - packetsAcked / packetsSent));
}

export function resetMetrics(): void {
  RTT_SAMPLES.length = 0;
  packetsSent = 0;
  packetsAcked = 0;
}

export function getConnectionGrade(): ConnectionGrade {
  const avgRTT = getAverageRTT();
  const loss = getPacketLoss();
  if (avgRTT === 0) return 'excellent';
  if (avgRTT < 80 && loss < 0.05) return 'excellent';
  if (avgRTT < 200 && loss < 0.1) return 'good';
  if (avgRTT < 500 && loss < 0.25) return 'poor';
  return 'dead';
}

export function getConnectionMetrics(): ConnectionMetrics {
  return {
    rtt: getAverageRTT(),
    grade: getConnectionGrade(),
    packetLoss: getPacketLoss(),
    jitter: calculateJitter(),
    timestamp: Date.now(),
  };
}

function calculateJitter(): number {
  if (RTT_SAMPLES.length < 3) return 0;
  let sum = 0;
  for (let i = 1; i < RTT_SAMPLES.length; i++) {
    sum += Math.abs(RTT_SAMPLES[i] - RTT_SAMPLES[i - 1]);
  }
  return sum / (RTT_SAMPLES.length - 1);
}

export function getAdaptiveSettings(): { frameSkip: boolean; reducedParticles: boolean; lowResCanvas: boolean; disableShadows: boolean; reducedAnimations: boolean } {
  const grade = getConnectionGrade();
  switch (grade) {
    case 'excellent': return { frameSkip: false, reducedParticles: false, lowResCanvas: false, disableShadows: false, reducedAnimations: false };
    case 'good': return { frameSkip: false, reducedParticles: false, lowResCanvas: false, disableShadows: false, reducedAnimations: true };
    case 'poor': return { frameSkip: true, reducedParticles: true, lowResCanvas: true, disableShadows: true, reducedAnimations: true };
    case 'dead': return { frameSkip: true, reducedParticles: true, lowResCanvas: true, disableShadows: true, reducedAnimations: true };
  }
}
