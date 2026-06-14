import { WebSocket } from 'ws';
import { SocketMessage } from '../types';
import {
  handleReconnect,
  handleSetAiOpponent as handlePvPSetAiOpponent,
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
  handleCallPocket,
} from './gameActions';
import {
  isAiPlayer,
  getAiPlayerRoom,
  handleStartAiMatch,
  handleSetAiOpponent as handleAiSetAiOpponent,
  handleAiShoot,
  handleAiPreviewAim,
  handleAiResetCueBall,
  handleAiRematch,
  handleAiDisconnect,
} from './aiMatchManager';
import { pushEventLog } from './state';

async function routeAiMessage(ws: WebSocket, msg: SocketMessage): Promise<void> {
  pushEventLog('ws_ai_route', { type: msg.type });
  switch (msg.type) {
    case 'start_ai_match':
      handleStartAiMatch(ws, msg);
      break;
    case 'set_ai_opponent':
      handleAiSetAiOpponent(ws, msg);
      break;
    case 'shoot':
      await handleAiShoot(ws, msg);
      break;
    case 'preview_aim':
      handleAiPreviewAim(ws, msg);
      break;
    case 'reset_cue_ball':
      handleAiResetCueBall(ws, msg);
      break;
    case 'rematch':
      handleAiRematch(ws);
      break;
    case 'leave':
      handleAiDisconnect(ws);
      break;
    case 'chat':
      handleChat(ws, msg);
      break;
    case 'ping':
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'pong' }));
      break;
    default:
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message: `Unknown message type for AI match: ${(msg as any).type}` }));
      }
      break;
  }
}

export async function routeWsMessage(ws: WebSocket, msg: SocketMessage): Promise<void> {
  pushEventLog('ws_message_in', { type: msg.type });

  // Mode-based dispatch: AI vs PvP
  if (isAiPlayer(ws)) {
    await routeAiMessage(ws, msg);
    return;
  }

  switch (msg.type) {
    case 'start_ai_match':
      handleStartAiMatch(ws, msg);
      break;
    case 'reconnect':
      await handleReconnect(ws, msg);
      break;
    case 'set_ai_opponent':
      await handlePvPSetAiOpponent(ws, msg);
      break;
    case 'preview_aim':
      handlePreviewAim(ws, msg);
      break;
    case 'shoot':
      await handleShoot(ws, msg);
      break;
    case 'call_pocket':
      handleCallPocket(ws, msg);
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
