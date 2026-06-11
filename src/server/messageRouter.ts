import { WebSocket } from 'ws';
import { SocketMessage } from '../types';
import {
  handleReconnect,
  handleSetAiOpponent,
  handlePreviewAim,
  handleShoot,
  handleResetCueBall,
  handleChat,
  handleRematch,
  handleDisconnect,
  handleCreateRoom,
  handleListRooms,
  handleJoin,
  handleJoinByCode,
  handleJoinRandom,
  handleCancelWaiting,
  handleAuthenticate,
} from './gameActions';
import { pushEventLog } from './state';

export async function routeWsMessage(ws: WebSocket, msg: SocketMessage): Promise<void> {
  pushEventLog('ws_message_in', { type: msg.type, sensitive: msg.type === 'reconnect' });

  switch (msg.type) {
    case 'reconnect':
      await handleReconnect(ws, msg);
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
    case 'rematch':
      handleRematch(ws);
      break;
    case 'leave':
      await handleDisconnect(ws);
      break;
    case 'create_room':
      await handleCreateRoom(ws, msg);
      break;
    case 'list_rooms':
      handleListRooms(ws, msg);
      break;
    case 'join_by_code':
      await handleJoinByCode(ws, msg);
      break;
    case 'join_random':
      await handleJoinRandom(ws, msg);
      break;
    case 'cancel_waiting':
      await handleCancelWaiting(ws);
      break;
    case 'join':
      await handleJoin(ws, msg);
      break;
    case 'authenticate':
      handleAuthenticate(ws, msg);
      break;
    case 'ping':
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
      break;
    default:
      if (ws.readyState === WebSocket.OPEN) {
        const unknownType = (msg as any).type;
        pushEventLog('ws_unknown_type', { type: unknownType });
        ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${unknownType}` }));
      }
      break;
  }
}
