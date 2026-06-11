import { WebSocketServer, WebSocket } from 'ws';
import { handleDisconnect } from './gameActions';
import { routeWsMessage } from './messageRouter';
import { activeSockets, startIdleRoomCleanup } from './state';
import { startAiCleanup, startAiMatchTimer } from './aiMatchManager';

// Per-message-type rate limits
interface TypeLimit {
  max: number;
  windowMs: number;
}

const MESSAGE_TYPE_LIMITS: Record<string, TypeLimit> = {
  preview_aim:     { max: 30, windowMs: 1000 },
  shoot:           { max: 3,  windowMs: 1000 },
  reset_cue_ball:  { max: 5,  windowMs: 1000 },
};

const DEFAULT_LIMIT: TypeLimit = { max: 30, windowMs: 1000 };

interface TypeCounter {
  count: number;
  resetAt: number;
}

// Per-socket: message type → { count, resetAt }
const rateLimitMap = new WeakMap<WebSocket, Map<string, TypeCounter>>();

function wsRateLimiter(ws: WebSocket, type: string): boolean {
  const now = Date.now();
  let typeMap = rateLimitMap.get(ws);
  if (!typeMap) {
    typeMap = new Map();
    rateLimitMap.set(ws, typeMap);
  }

  const limit = MESSAGE_TYPE_LIMITS[type] || DEFAULT_LIMIT;
  let counter = typeMap.get(type);
  if (!counter || now > counter.resetAt) {
    typeMap.set(type, { count: 1, resetAt: now + limit.windowMs });
    return true;
  }

  counter.count++;
  if (counter.count > limit.max) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'error', message: `Rate limited: ${type} (${limit.max}/${limit.windowMs}ms). Slow down.` }));
    }
    return false;
  }
  return true;
}

// Heartbeat / early disconnect detection
const HEARTBEAT_INTERVAL_MS = 30000;
const HEARTBEAT_TIMEOUT_MS = 10000;
const lastPong = new WeakMap<WebSocket, number>();

function heartbeat(this: WebSocket): void {
  lastPong.set(this, Date.now());
}

function startHeartbeat(): void {
  setInterval(() => {
    const now = Date.now();
    for (const ws of activeSockets) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const last = lastPong.get(ws);
      if (last && now - last > HEARTBEAT_INTERVAL_MS + HEARTBEAT_TIMEOUT_MS) {
        ws.terminate();
        continue;
      }
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS).unref();
}

export function attachWebSocketHandlers(wss: WebSocketServer) {
  wss.on('connection', (ws) => {
    activeSockets.add(ws);
    lastPong.set(ws, Date.now());

    ws.on('pong', heartbeat);

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        const type = (msg && msg.type) || 'unknown';
        if (!wsRateLimiter(ws, type)) return;
        await routeWsMessage(ws, msg);
      } catch (e: any) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'error', message: 'Decoding Error: ' + e.message }));
        }
      }
    });

    ws.on('close', () => {
      activeSockets.delete(ws);
      rateLimitMap.delete(ws);
      lastPong.delete(ws);
      handleDisconnect(ws).catch(() => {});
    });
  });

  startHeartbeat();
  startIdleRoomCleanup();
  startAiCleanup();
  startAiMatchTimer();
}
