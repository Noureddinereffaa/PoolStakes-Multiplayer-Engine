import { WebSocketServer, WebSocket } from 'ws';
import { handleDisconnect } from './gameActions';
import { routeWsMessage } from './messageRouter';
import { activeSockets } from './state';

export function attachWebSocketHandlers(wss: WebSocketServer) {
  wss.on('connection', (ws) => {
    activeSockets.add(ws);

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        routeWsMessage(ws, msg);
      } catch (e: any) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'error', message: 'Decoding Error: ' + e.message }));
        }
      }
    });

    ws.on('close', () => {
      activeSockets.delete(ws);
      handleDisconnect(ws);
    });
  });
}
