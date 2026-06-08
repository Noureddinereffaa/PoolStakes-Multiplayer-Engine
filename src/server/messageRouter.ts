import { WebSocket } from 'ws';
import { SocketMessage } from '../types';
import {
  handleJoin,
  handleSetAiOpponent,
  handlePreviewAim,
  handleShoot,
  handleResetCueBall,
  handleChat,
  handleDisconnect
} from './gameActions';

export async function routeWsMessage(ws: WebSocket, msg: SocketMessage) {
  switch (msg.type) {
    case 'join':
      await handleJoin(ws, msg);
      break;
    case 'set_ai_opponent':
      await handleSetAiOpponent(ws, msg);
      break;
    case 'preview_aim':
      handlePreviewAim(ws, msg);
      break;
    case 'shoot':
      handleShoot(ws, msg);
      break;
    case 'reset_cue_ball':
      handleResetCueBall(ws, msg);
      break;
    case 'chat':
      handleChat(ws, msg);
      break;
    case 'leave':
      handleDisconnect(ws);
      break;
    default:
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${(msg as any).type}` }));
      }
      break;
  }
}
