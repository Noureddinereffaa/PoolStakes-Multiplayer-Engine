import { WebSocketServer, WebSocket } from 'ws';
import { handleDisconnect } from './gameActions';
import { routeWsMessage } from './messageRouter';
import { activeSockets } from './state';

// Simple rate limiter: max N messages per second per connection
const rateLimitMap = new WeakMap<WebSocket, { count: number; resetAt: number }>();
const WS_RATE_LIMIT_MAX = 30; // max messages per window
const WS_RATE_LIMIT_WINDOW_MS = 1000; // 1 second

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

export function attachWebSocketHandlers(wss: WebSocketServer) {
  wss.on('connection', (ws) => {
    activeSockets.add(ws);

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
      handleDisconnect(ws);
    });
  });
}