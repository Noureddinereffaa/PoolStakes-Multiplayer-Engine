import { useState, useRef, useEffect, useCallback } from 'react';
import { RoomState, Ball, Difficulty } from './types';
import { simulatePhysicsStep, isAnyBallMoving, captureFrame, powerToVelocity, getInitialBalls } from './server/physics';
import { markPingSent, markPongReceived, resetMetrics, getConnectionGrade } from './utils/connectionQuality';

interface QueuedMessage {
  type: string;
  payload: any;
  timestamp: number;
}

interface UseBilliardsSocketProps {
  username?: string;
  fetchLaravelUsers: () => void;
  setApiLogs: React.Dispatch<React.SetStateAction<any[]>>;
  setErrorBanner: (msg: string | null) => void;
  onConnectionGradeChange?: (grade: string) => void;
}

const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;
const PING_INTERVAL = 5000;
const CONNECTION_TIMEOUT = 10000;

function getBackoffDelay(attempt: number): number {
  const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, attempt), MAX_RECONNECT_DELAY);
  return delay + Math.random() * 1000;
}

export function useBilliardsSocket({
  username,
  fetchLaravelUsers,
  setApiLogs,
  setErrorBanner,
  onConnectionGradeChange,
}: UseBilliardsSocketProps) {
  const [roomId, setRoomId] = useState('Vegas_Golden_Suite');
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [physicsFrames, setPhysicsFrames] = useState<Array<Array<{ id: number; x: number; y: number; isPocketed: boolean }>> | null>(null);
  const [physicsTotalSteps, setPhysicsTotalSteps] = useState<number | null>(null);
  const [opponentAim, setOpponentAim] = useState<{ angle: number; power: number; spinX?: number; spinY?: number } | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [connectionGrade, setConnectionGrade] = useState<string>('excellent');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [publicRooms, setPublicRooms] = useState<Array<{ roomId: string; roomCode: string; stake: number; players: number; status: string }>>([]);
  const [roomCreationCode, setRoomCreationCode] = useState<string | null>(null);
  const [pendingShotTick, setPendingShotTick] = useState(0);
  const [isSearching, setIsSearching] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  
  // Strict-mode / unmount cleanup
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      if (pingTimerRef.current) { clearInterval(pingTimerRef.current); pingTimerRef.current = null; }
      if (pongTimeoutRef.current) { clearTimeout(pongTimeoutRef.current); pongTimeoutRef.current = null; }
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
      if (fallbackTimerRef.current) { clearTimeout(fallbackTimerRef.current); fallbackTimerRef.current = null; }
    };
  }, []);
  
  const reconnectRef = useRef<{ targetRoomId: string; customStake: number; autoJoinAI: boolean | Difficulty } | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pongTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingShotRef = useRef<{ angle: number; power: number } | null>(null);
  const roomStateRef = useRef<RoomState | null>(null);
  roomStateRef.current = roomState;
  const wasInActiveGameRef = useRef(false);
  const offlineQueueRef = useRef<QueuedMessage[]>([]);
  const isOnlineRef = useRef(navigator.onLine);

  const fetchRef = useRef(fetchLaravelUsers);
  const setApiLogsRef = useRef(setApiLogs);
  const setErrorRef = useRef(setErrorBanner);
  const usernameRef = useRef(username);
  const onGradeRef = useRef(onConnectionGradeChange);

  useEffect(() => { fetchRef.current = fetchLaravelUsers; }, [fetchLaravelUsers]);
  useEffect(() => { setApiLogsRef.current = setApiLogs; }, [setApiLogs]);
  useEffect(() => { setErrorRef.current = setErrorBanner; }, [setErrorBanner]);
  useEffect(() => { usernameRef.current = username; }, [username]);
  useEffect(() => { onGradeRef.current = onConnectionGradeChange; }, [onConnectionGradeChange]);

  useEffect(() => { setOpponentAim(null); }, [roomState?.currentTurn, roomState?.status]);

  // مراقبة حالة الاتصال بالإنترنت
  useEffect(() => {
    const goOnline = () => {
      isOnlineRef.current = true;
      setIsOffline(false);
      if (offlineQueueRef.current.length > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
        while (offlineQueueRef.current.length > 0) {
          const msg = offlineQueueRef.current.shift();
          if (msg) wsRef.current.send(JSON.stringify(msg.payload));
        }
      }
    };
    const goOffline = () => {
      isOnlineRef.current = false;
      setIsOffline(true);
      setConnectionGrade('dead');
      onGradeRef.current?.('dead');
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Shared message handler – used by both connect() and ensureWsConnected()
  const handleSocketMessage = (event: MessageEvent, fallbackTimer: ReturnType<typeof setTimeout> | null, isReconnectCheck: boolean = false) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'pong') {
          markPongReceived();
          if (pongTimeoutRef.current) clearTimeout(pongTimeoutRef.current);
          const grade = getConnectionGrade();
          setConnectionGrade(grade);
          onGradeRef.current?.(grade);
          return;
        }

        switch (msg.type) {
          case 'sync_state':
            if (fallbackTimer) clearTimeout(fallbackTimer);
            if (mountedRef.current) {
              setIsReconnecting(false);
              setConnectionGrade('excellent');
              onGradeRef.current?.('excellent');
              setIsSearching(false);
            }
            wasInActiveGameRef.current = msg.state.status === 'playing' || msg.state.status === 'ready';
            if (msg.state.status === 'gameover') {
              reconnectRef.current = null;
              reconnectAttemptRef.current = 0;
            }
            if (mountedRef.current) {
              // Client-side state validation: compare local physics with server state
              const localState = roomStateRef.current;
              if (localState && localState.status === 'playing' && msg.state.status === 'playing') {
                // Check for significant position discrepancies
                let maxPosDiff = 0;
                for (const serverBall of msg.state.balls) {
                  const localBall = localState.balls.find(b => b.id === serverBall.id);
                  if (localBall && !localBall.isPocketed && !serverBall.isPocketed) {
                    const dx = localBall.x - serverBall.x;
                    const dy = localBall.y - serverBall.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    maxPosDiff = Math.max(maxPosDiff, dist);
                  }
                }
                // If discrepancy > 5 units (half ball radius), log warning
                if (maxPosDiff > 5) {
                  console.warn('[Client Validation] Significant position drift detected:', maxPosDiff.toFixed(2), 'units');
                }
              }
              setRoomState(msg.state);
              setOpponentAim(null);
            }
            try {
              sessionStorage.setItem('arena_room_id', msg.state.roomId || '');
              sessionStorage.setItem('arena_stake', String(msg.state.stake || 0));
            } catch {}
            break;
          case 'physics_frames':
            if (mountedRef.current) {
              setOpponentAim(null);
              setPhysicsFrames(
                (msg.frames as Array<Array<[number, number, number, number]>>).map(frame =>
                  frame.map(b => ({ id: b[0], x: b[1], y: b[2], isPocketed: b[3] === 1 }))
                )
              );
              setPhysicsTotalSteps((msg as any).totalSteps || null);
            }
            break;
          case 'preview_aim':
            if (mountedRef.current) {
              setOpponentAim({
                angle: msg.angle,
                power: msg.power,
                spinX: msg.spinX || 0,
                spinY: msg.spinY || 0,
              });
            }
            break;
          case 'disconnect_notice':
            if (mountedRef.current) {
              setRoomState((prev: any) => {
                if (!prev) return prev;
                const disconnectedPlayerIds = [...(prev.disconnectedPlayerIds || []), msg.playerId];
                const reconnectDeadlines = { ...(prev.reconnectDeadlines || {}), [msg.playerId]: msg.deadline };
                const players = prev.players.map((p: any) =>
                  p.id === msg.playerId ? { ...p, isConnected: false } : p
                );
                return { ...prev, disconnectedPlayerIds, reconnectDeadlines, players };
              });
            }
            if (mountedRef.current) setErrorRef.current('Opponent disconnected. Waiting for reconnection...');
            setTimeout(() => { if (mountedRef.current) setErrorRef.current(null); }, 30000);
            break;
          case 'reconnect_notice':
            if (mountedRef.current) {
              setRoomState((prev: any) => {
                if (!prev) return prev;
                const disconnectedPlayerIds = (prev.disconnectedPlayerIds || []).filter((id: string) => id !== msg.playerId);
                const reconnectDeadlines = { ...(prev.reconnectDeadlines || {}) };
                delete reconnectDeadlines[msg.playerId];
                const players = prev.players.map((p: any) =>
                  p.id === msg.playerId ? { ...p, isConnected: true } : p
                );
                return { ...prev, disconnectedPlayerIds, reconnectDeadlines, players };
              });
            }
            if (mountedRef.current) setErrorRef.current(null);
            break;
          case 'laravel_api_log':
            if (mountedRef.current) setApiLogsRef.current((prev: any) => [msg, ...prev]);
            break;
          case 'room_created':
            if (mountedRef.current) {
              setRoomCreationCode(msg.roomCode);
              setRoomId(msg.roomId);
            }
            break;
          case 'rooms_list':
            if (mountedRef.current) setPublicRooms(msg.rooms);
            break;
          case 'searching':
            if (mountedRef.current) setIsSearching(true);
            break;
          case 'join_success':
            if (mountedRef.current) setRoomId(msg.roomId);
            break;
          case 'room_not_found':
            if (mountedRef.current) setErrorRef.current(msg.message);
            setTimeout(() => { if (mountedRef.current) setErrorRef.current(null); }, 4000);
            break;
          case 'cancel_waiting_confirmed':
            try { sessionStorage.removeItem('arena_room_id'); sessionStorage.removeItem('arena_stake'); } catch {}
            if (mountedRef.current) {
              setIsSearching(false);
              setRoomState(null);
              setRoomCreationCode(null);
            }
            break;
          case 'error':
            if (mountedRef.current) setIsSearching(false);
            if (isReconnectCheck) {
              if (mountedRef.current) {
                setIsReconnecting(false);
                setErrorRef.current(msg.message || 'Reconnection failed. The match may have ended.');
              }
              reconnectRef.current = null;
              reconnectAttemptRef.current = 0;
            } else {
              if (mountedRef.current) setErrorRef.current(msg.message);
              setTimeout(() => { if (mountedRef.current) setErrorRef.current(null); }, 4500);
            }
            break;
        }
      } catch (err) {
        console.error('Error decoding client websocket msg:', err);
      }
  };

  const connect = useCallback((targetRoomId: string, customStake: number, autoJoinAI: boolean | Difficulty = false, isReconnect = false) => {
    if (!isReconnect) {
      reconnectAttemptRef.current = 0;
      resetMetrics();
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
    if (pongTimeoutRef.current) {
      clearTimeout(pongTimeoutRef.current);
      pongTimeoutRef.current = null;
    }

    setPhysicsFrames(null);
    setPhysicsTotalSteps(null);

    if (wsRef.current) {
      wsRef.current.close();
    }

    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }

    const wsHost = window.location.host;
    const forceWss = import.meta.env.VITE_ENFORCE_WSS === 'true';
    const protocol = forceWss || window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${wsHost}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    fallbackTimerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      setErrorRef.current('Backend Server Offline. Entering Local Practice Mode.');
      setConnectionGrade('poor');
      onGradeRef.current?.('poor');
      setRoomState({
        roomId: targetRoomId,
        name: (targetRoomId || '').replace(/_/g, ' '),
        status: 'playing',
        stake: customStake,
        players: [
          { id: 'local-1', username: usernameRef.current || 'Guest', walletBalance: 500, bettingStake: customStake, side: 'solids', isConnected: true },
          { id: 'local-bot', username: 'Bot_AI', walletBalance: 1000, bettingStake: customStake, side: 'stripes', isConnected: true }
        ],
        currentTurn: 'local-1',
        balls: [
          { id: 0, x: 200, y: 200, vx: 0, vy: 0, radius: 10, isPocketed: false, color: '#ffffff', type: 'cue' },
          { id: 1, x: 550, y: 200, vx: 0, vy: 0, radius: 10, isPocketed: false, color: '#CFAF30', type: 'solid', number: 1 },
          { id: 2, x: 568, y: 190, vx: 0, vy: 0, radius: 10, isPocketed: false, color: '#1B4CA7', type: 'solid', number: 2 },
          { id: 3, x: 568, y: 210, vx: 0, vy: 0, radius: 10, isPocketed: false, color: '#B12724', type: 'solid', number: 3 },
          { id: 8, x: 586, y: 200, vx: 0, vy: 0, radius: 10, isPocketed: false, color: '#111111', type: 'black', number: 8 },
          { id: 4, x: 586, y: 180, vx: 0, vy: 0, radius: 10, isPocketed: false, color: '#5F3E9C', type: 'solid', number: 4 },
          { id: 5, x: 586, y: 220, vx: 0, vy: 0, radius: 10, isPocketed: false, color: '#C86414', type: 'solid', number: 5 },
          { id: 6, x: 604, y: 170, vx: 0, vy: 0, radius: 10, isPocketed: false, color: '#0F7B4D', type: 'solid', number: 6 },
          { id: 7, x: 604, y: 190, vx: 0, vy: 0, radius: 10, isPocketed: false, color: '#7A1E2A', type: 'solid', number: 7 },
          { id: 9, x: 604, y: 210, vx: 0, vy: 0, radius: 10, isPocketed: false, color: '#D7B037', type: 'stripe', number: 9 },
          { id: 10, x: 604, y: 230, vx: 0, vy: 0, radius: 10, isPocketed: false, color: '#4A76C8', type: 'stripe', number: 10 },
          { id: 11, x: 622, y: 160, vx: 0, vy: 0, radius: 10, isPocketed: false, color: '#D45851', type: 'stripe', number: 11 },
          { id: 12, x: 622, y: 180, vx: 0, vy: 0, radius: 10, isPocketed: false, color: '#9D6FD1', type: 'stripe', number: 12 },
          { id: 13, x: 622, y: 200, vx: 0, vy: 0, radius: 10, isPocketed: false, color: '#D28D3E', type: 'stripe', number: 13 },
          { id: 14, x: 622, y: 220, vx: 0, vy: 0, radius: 10, isPocketed: false, color: '#3CA972', type: 'stripe', number: 14 },
          { id: 15, x: 622, y: 240, vx: 0, vy: 0, radius: 10, isPocketed: false, color: '#8A1A24', type: 'stripe', number: 15 },
        ],
        assignedSides: false,
        pocketedThisTurn: false,
        log: ['[System] Connection failed.', '[System] Offline Practice Mode Activated.'],
        turnTimer: 60,
        scratchOccurred: false,
        escrowHash: 'mock-offline-hash-00000000'
      });
    }, 2000);

    ws.onopen = () => {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
      reconnectAttemptRef.current = 0;
      setConnectionGrade('excellent');
      onGradeRef.current?.('excellent');
      setIsReconnecting(false);
      const token = (() => { try { const s = JSON.parse(localStorage.getItem('billiards_session') || '{}'); return s.token || ''; } catch { return ''; } })();

      if (isReconnect) {
        ws.send(JSON.stringify({ type: 'reconnect', token }));
      } else if (autoJoinAI) {
        ws.send(JSON.stringify({
          type: 'start_ai_match',
          difficulty: typeof autoJoinAI === 'string' ? autoJoinAI : 'medium',
          username: usernameRef.current ?? 'Player'
        }));
      } else {
        ws.send(JSON.stringify({
          type: 'join',
          roomId: targetRoomId,
          username: usernameRef.current ?? '',
          stake: customStake,
          token
        }));
      }
      if (mountedRef.current) setErrorRef.current(null);

      // بدء مؤقت ping/pann لمراقبة جودة الاتصال
      if (pingTimerRef.current) clearInterval(pingTimerRef.current);
      pingTimerRef.current = setInterval(() => {
        if (!mountedRef.current || ws.readyState !== WebSocket.OPEN) return;
        markPingSent();
        ws.send(JSON.stringify({ type: 'ping' }));
        if (pongTimeoutRef.current) clearTimeout(pongTimeoutRef.current);
        pongTimeoutRef.current = setTimeout(() => {
          if (!mountedRef.current) return;
          setConnectionGrade('poor');
          onGradeRef.current?.('poor');
        }, CONNECTION_TIMEOUT);
      }, PING_INTERVAL);

      while (offlineQueueRef.current.length > 0) {
        const msg = offlineQueueRef.current.shift();
        if (msg) ws.send(JSON.stringify(msg.payload));
      }
    };

    ws.onmessage = (event) => handleSocketMessage(event, fallbackTimerRef.current, isReconnect);

    ws.onclose = () => {
      if (pingTimerRef.current) {
        clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
      if (pongTimeoutRef.current) {
        clearTimeout(pongTimeoutRef.current);
        pongTimeoutRef.current = null;
      }

      const currentRoom = roomStateRef.current;
      if (currentRoom && (currentRoom.status === 'playing' || currentRoom.status === 'ready')) {
        wasInActiveGameRef.current = true;
        if (mountedRef.current) setIsReconnecting(true);
      }

      if (!isOnlineRef.current) {
        setConnectionGrade('dead');
        onGradeRef.current?.('dead');
        return;
      }

      if (reconnectRef.current && reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = getBackoffDelay(reconnectAttemptRef.current);
        reconnectAttemptRef.current++;
        setConnectionGrade('poor');
        onGradeRef.current?.('poor');
        if (mountedRef.current) setErrorRef.current(`Connection lost. Reconnecting in ${Math.round(delay / 1000)}s... (attempt ${reconnectAttemptRef.current}/${MAX_RECONNECT_ATTEMPTS})`);
        reconnectTimerRef.current = setTimeout(() => {
          if (reconnectRef.current) {
            connect(reconnectRef.current.targetRoomId, reconnectRef.current.customStake, reconnectRef.current.autoJoinAI, true);
          }
        }, delay);
      } else {
        if (mountedRef.current) setIsReconnecting(false);
        wasInActiveGameRef.current = false;
        reconnectRef.current = null;
        setConnectionGrade('dead');
        onGradeRef.current?.('dead');
        setIsSearching(false);
      }
    };

    ws.onerror = () => {
      setConnectionGrade('poor');
      onGradeRef.current?.('poor');
    };
  }, []);

  const ensureWsConnected = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
    if (wsRef.current && (wsRef.current.readyState === WebSocket.CONNECTING)) return;
    // Establish a WS connection for lobby operations (authenticate without joining a room)
    const wsHost = window.location.host;
    const forceWss = import.meta.env.VITE_ENFORCE_WSS === 'true';
    const protocol = forceWss || window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${wsHost}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      reconnectAttemptRef.current = 0;
      setIsReconnecting(false);
      setConnectionGrade('excellent');
      const token = (() => { try { const s = JSON.parse(localStorage.getItem('billiards_session') || '{}'); return s.token || ''; } catch { return ''; } })();

      // Send authenticate (not join) since this is a lobby connection
      ws.send(JSON.stringify({ type: 'authenticate', token }));

      if (pingTimerRef.current) clearInterval(pingTimerRef.current);
      pingTimerRef.current = setInterval(() => {
        if (!mountedRef.current || ws.readyState !== WebSocket.OPEN) return;
        markPingSent();
        ws.send(JSON.stringify({ type: 'ping' }));
        if (pongTimeoutRef.current) clearTimeout(pongTimeoutRef.current);
        pongTimeoutRef.current = setTimeout(() => {
          if (!mountedRef.current) return;
          setConnectionGrade('poor');
          onGradeRef.current?.('poor');
        }, CONNECTION_TIMEOUT);
      }, PING_INTERVAL);

      while (offlineQueueRef.current.length > 0) {
        const msg = offlineQueueRef.current.shift();
        if (msg) ws.send(JSON.stringify(msg.payload));
      }
    };

    ws.onmessage = (event) => handleSocketMessage(event, fallbackTimer, false);

    ws.onclose = () => {
      if (pingTimerRef.current) { clearInterval(pingTimerRef.current); pingTimerRef.current = null; }
      if (pongTimeoutRef.current) { clearTimeout(pongTimeoutRef.current); pongTimeoutRef.current = null; }
      setConnectionGrade('dead');
    };

    ws.onerror = () => { setConnectionGrade('poor'); };
  }, []);

  const handleJoinRoom = useCallback((targetRoomId: string, customStake: number, autoJoinAI: boolean | Difficulty = false) => {
    setIsSearching(false);
    reconnectRef.current = { targetRoomId, customStake, autoJoinAI };
    reconnectAttemptRef.current = 0;
    connect(targetRoomId, customStake, autoJoinAI);
  }, [connect]);

  function sendOrQueue(payload: Record<string, any>): boolean {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
      return true;
    }
    offlineQueueRef.current.push({ type: payload.type, payload, timestamp: Date.now() });
    return false;
  }

  const handlePreviewAim = useCallback((angle: number, power: number, spinX?: number, spinY?: number) => {
    sendOrQueue({ type: 'preview_aim', angle, power, spinX: spinX || 0, spinY: spinY || 0 });
  }, []);

  const handleShoot = useCallback((angle: number, power: number, spinX?: number, spinY?: number) => {
    const sent = sendOrQueue({ type: 'shoot', angle, power, spinX: spinX || 0, spinY: spinY || 0 });
    if (!sent && roomStateRef.current) {
      pendingShotRef.current = { angle, power };
      setPendingShotTick((t) => t + 1);
    }
  }, []);

  const handleResetCueBall = useCallback((x: number, y: number) => {
    sendOrQueue({ type: 'reset_cue_ball', x, y });
  }, []);

  const handleJoinAI = useCallback((difficulty: Difficulty = 'medium') => {
    sendOrQueue({ type: 'set_ai_opponent', difficulty });
  }, []);

  const handleSendChat = useCallback((message: string) => {
    sendOrQueue({ type: 'chat', message });
  }, []);

  const handleRematch = useCallback(() => {
    const sent = sendOrQueue({ type: 'rematch' });
    if (!sent && roomStateRef.current?.players.some(p => p.id.startsWith('ai-'))) {
      // AI game offline rematch — reset balls locally
      if (mountedRef.current) {
        setRoomState((prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            balls: getInitialBalls(),
            status: 'playing',
            currentTurn: prev.players[0]?.id || 'local-1',
            assignedSides: false,
            scratchOccurred: false,
            pocketedThisTurn: false,
            ballInHandRestriction: undefined,
            winnerId: undefined,
            turnTimer: 60,
            log: ['🔄 Rematch! New game started.'],
          };
        });
        setPhysicsFrames(null);
        setPhysicsTotalSteps(null);
      }
    }
  }, []);

  const handleQuitRoom = useCallback(() => {
    reconnectRef.current = null;
    reconnectAttemptRef.current = 0;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    try { sessionStorage.removeItem('arena_room_id'); sessionStorage.removeItem('arena_stake'); } catch {}
    if (mountedRef.current) {
      setRoomState(null);
      setPhysicsFrames(null);
      setPhysicsTotalSteps(null);
      setRoomCreationCode(null);
      setIsSearching(false);
    }
    fetchRef.current();
  }, []);

  const handleCreateRoom = useCallback((stake: number, isPublic: boolean = true) => {
    setRoomCreationCode(null);
    const token = (() => { try { const s = JSON.parse(localStorage.getItem('billiards_session') || '{}'); return s.token || ''; } catch { return ''; } })();
    sendOrQueue({ type: 'create_room', stake, isPublic, token });
  }, []);

  const handleListRooms = useCallback((stake?: number) => {
    sendOrQueue({ type: 'list_rooms', stake });
  }, []);

  const handleJoinByCode = useCallback((code: string) => {
    const token = (() => { try { const s = JSON.parse(localStorage.getItem('billiards_session') || '{}'); return s.token || ''; } catch { return ''; } })();
    sendOrQueue({ type: 'join_by_code', code, username: usernameRef.current ?? '', token });
  }, []);

  const handleJoinRandom = useCallback((stake: number) => {
    const token = (() => { try { const s = JSON.parse(localStorage.getItem('billiards_session') || '{}'); return s.token || ''; } catch { return ''; } })();
    setIsSearching(true);
    sendOrQueue({ type: 'join_random', stake, username: usernameRef.current ?? '', token });
  }, []);

  const handleCancelWaiting = useCallback(() => {
    setIsSearching(false);
    setRoomState(null);
    sendOrQueue({ type: 'cancel_waiting' });
  }, []);

  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (pingTimerRef.current) clearInterval(pingTimerRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (pongTimeoutRef.current) clearTimeout(pongTimeoutRef.current);
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const pending = pendingShotRef.current;
    if (!pending || !roomState) return;
    pendingShotRef.current = null;

    const angle = pending.angle;
    const power = pending.power;
    const balls: Ball[] = roomState.balls.map((b: any) => ({ ...b, vx: 0, vy: 0, spinX: 0, spinY: 0, sleeping: false }));
    const cueBall = balls.find(b => b.id === 0);
    if (!cueBall) return;

    const forceMag = powerToVelocity(power);
    cueBall.vx = Math.cos(angle) * forceMag;
    cueBall.vy = Math.sin(angle) * forceMag;

    const mockFrames: Array<{ id: number; x: number; y: number; isPocketed: boolean }[]> = [];
    mockFrames.push(captureFrame(balls));

    let iter = 0;
    while (iter < 2400) {
      simulatePhysicsStep(balls);
      mockFrames.push(captureFrame(balls));
      iter++;
      if (!isAnyBallMoving(balls)) break;
    }

    if (mountedRef.current) {
      setPhysicsFrames(mockFrames);

      const nextTurn = roomState.currentTurn === roomState.players[0]?.id
        ? (roomState.players[1]?.id || roomState.players[0].id)
        : roomState.players[0]?.id;

      setRoomState((prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          currentTurn: nextTurn,
          balls: balls.map((b: Ball) => ({ ...b, vx: 0, vy: 0 })),
          log: [...prev.log, `[Offline] Shot fired with ${power}% power.`]
        };
      });
    }
  }, [roomState, pendingShotTick]);

  return {
    roomId,
    setRoomId,
    roomState,
    physicsFrames,
    setPhysicsFrames,
    physicsTotalSteps,
    opponentAim,
    isReconnecting,
    connectionGrade,
    isOffline,
    publicRooms,
    roomCreationCode,
    isSearching,
    handleJoinRoom,
    handlePreviewAim,
    handleShoot,
    handleResetCueBall,
    handleJoinAI,
    handleSendChat,
    handleRematch,
    handleQuitRoom,
    handleCreateRoom,
    handleListRooms,
    handleJoinByCode,
    handleJoinRandom,
    handleCancelWaiting,
    ensureWsConnected,
  };
}