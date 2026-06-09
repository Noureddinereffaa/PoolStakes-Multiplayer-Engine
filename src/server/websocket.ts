import { WebSocketServer, WebSocket } from 'ws';
import { handleDisconnect } from './gameActions';
import { routeWsMessage } from './messageRouter';
import { activeSockets } from './state';

// Simple rate limiter: max N messages per second per connection
const rateLimitMap = new WeakMap<WebSocket, { count: number; resetAt: number }>();
const WS_RATE_LIMIT_MAX = 30;
const WS_RATE_LIMIT_WINDOW_MS = 1000;

function wsRateLimiter(ws: WebSocket): boolean {
  const now = Date.now();
  let entry = rateLimitMap.get(ws);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ws, { count: 1, resetAt: now + WS_RATE_LIMIT_WINDOW_MS });
    return true;
  }
  entry.count++;
  if (entry.count > WS_RATE_LIMIT_MAX) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'error', message: 'Rate limited: too many messages. Slow down.' }));
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
      if (!wsRateLimiter(ws)) return;

      try {
        const msg = JSON.parse(data.toString());
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
      handleDisconnect(ws);
    });
  });

  startHeartbeat();
}