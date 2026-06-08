import { useState, useRef, useEffect, useCallback } from 'react';
import { RoomState, Ball } from './types';
import { simulatePhysicsStep, isAnyBallMoving, captureFrame, powerToVelocity } from './server/physics';

interface UseBilliardsSocketProps {
  username?: string;
  fetchLaravelUsers: () => void;
  setApiLogs: React.Dispatch<React.SetStateAction<any[]>>;
  setErrorBanner: (msg: string | null) => void;
}

export function useBilliardsSocket({
  username,
  fetchLaravelUsers,
  setApiLogs,
  setErrorBanner
}: UseBilliardsSocketProps) {
  const [roomId, setRoomId] = useState('Vegas_Golden_Suite');
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [physicsFrames, setPhysicsFrames] = useState<Array<Array<{ id: number; x: number; y: number; isPocketed: boolean }>> | null>(null);
  const [opponentAim, setOpponentAim] = useState<{ angle: number; power: number; spinX?: number; spinY?: number } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<{ targetRoomId: string; customStake: number; autoJoinAI: boolean | 'easy' | 'medium' | 'hard' } | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // استخدام المراجع (Refs) لحفظ أحدث القيم للدوال لتجنب الإغلاقات القديمة (Stale Closures) داخل الـ WebSocket
  const fetchRef = useRef(fetchLaravelUsers);
  const setApiLogsRef = useRef(setApiLogs);
  const setErrorRef = useRef(setErrorBanner);
  const usernameRef = useRef(username);

  useEffect(() => { fetchRef.current = fetchLaravelUsers; }, [fetchLaravelUsers]);
  useEffect(() => { setApiLogsRef.current = setApiLogs; }, [setApiLogs]);
  useEffect(() => { setErrorRef.current = setErrorBanner; }, [setErrorBanner]);
  useEffect(() => { usernameRef.current = username; }, [username]);

  // تنظيف مسار تصويب الخصم عند تبديل الأدوار
  useEffect(() => {
    setOpponentAim(null);
  }, [roomState?.currentTurn, roomState?.status]);

  const connect = useCallback((targetRoomId: string, customStake: number, autoJoinAI: boolean | 'easy' | 'medium' | 'hard' = false, isReconnect = false) => {
    if (!isReconnect) {
      reconnectAttemptRef.current = 0;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    setPhysicsFrames(null);

    if (wsRef.current) {
      wsRef.current.close();
    }

    const wsHost = window.location.host;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${wsHost}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    let aiScheduled = autoJoinAI;

    // مؤقت (Fallback): إذا لم يرد الخادم خلال 1 ثانية، نُشغل وضع التجربة المحلي الأوفلاين
    const fallbackTimer = setTimeout(() => {
      setErrorRef.current('Backend Server Offline. Entering Local Practice Mode.');
      setRoomState({
        roomId: targetRoomId,
        name: targetRoomId.replace(/_/g, ' '),
        status: 'playing',
        stake: customStake,
        players: [
          { id: 'local-1', username: usernameRef.current || 'Guest', walletBalance: 500, side: 'solids' },
          { id: 'local-bot', username: 'Bot_AI', walletBalance: 1000, side: 'stripes' }
        ],
        currentTurn: 'local-1',
        winnerId: null,
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
        log: ['[System] Connection failed.', '[System] Offline Practice Mode Activated.'],
        chat: [],
        turnTimer: 60,
        scratchOccurred: false,
        ballInHandRestriction: 'none',
        escrowHash: 'mock-offline-hash-00000000'
      } as any);
    }, 1000);

    ws.onopen = () => {
      clearTimeout(fallbackTimer);
      reconnectAttemptRef.current = 0;
      ws.send(JSON.stringify({
        type: 'join',
        roomId: targetRoomId,
        username: usernameRef.current ?? '',
        stake: customStake
      }));
      setErrorRef.current(null);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case 'sync_state':
            clearTimeout(fallbackTimer);
            setRoomState(msg.state);
            fetchRef.current();
            if (aiScheduled && msg.state.players.length === 1 && msg.state.status === 'waiting') {
              const difficulty = typeof aiScheduled === 'string' ? aiScheduled : 'medium';
              ws.send(JSON.stringify({ type: 'set_ai_opponent', difficulty }));
              aiScheduled = false;
            }
            break;
          case 'physics_frames':
            // تحويل من مصفوفات مضغوطة [id, x, y, isPocketed] إلى كائنات
            setPhysicsFrames(
              (msg.frames as Array<Array<[number, number, number, number]>>).map(frame =>
                frame.map(b => ({ id: b[0], x: b[1], y: b[2], isPocketed: b[3] === 1 }))
              )
            );
            break;
          case 'preview_aim':
            setOpponentAim({
              angle: msg.angle,
              power: msg.power,
              spinX: msg.spinX || 0,
              spinY: msg.spinY || 0,
            });
            break;
          case 'laravel_api_log':
            setApiLogsRef.current(prev => [msg, ...prev]);
            break;
          case 'error':
            setErrorRef.current(msg.message);
            setTimeout(() => setErrorRef.current(null), 4500);
            break;
        }
      } catch (err) {
        console.error('Error decoding client websocket msg:', err);
      }
    };

    ws.onclose = () => {
      // Exponential backoff reconnection (1s, 2s, 4s, 8s, max 30s)
      if (reconnectRef.current && reconnectAttemptRef.current < 5) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 30000);
        reconnectAttemptRef.current++;
        setErrorRef.current(`Connection lost. Reconnecting in ${Math.round(delay / 1000)}s...`);
        reconnectTimerRef.current = setTimeout(() => {
          if (reconnectRef.current) {
            connect(reconnectRef.current.targetRoomId, reconnectRef.current.customStake, reconnectRef.current.autoJoinAI, true);
          }
        }, delay);
      } else {
        reconnectRef.current = null;
      }
    };

    ws.onerror = () => {
    };
  }, []);

  const handleJoinRoom = useCallback((targetRoomId: string, customStake: number, autoJoinAI: boolean | 'easy' | 'medium' | 'hard' = false) => {
    reconnectRef.current = { targetRoomId, customStake, autoJoinAI };
    reconnectAttemptRef.current = 0;
    connect(targetRoomId, customStake, autoJoinAI);
  }, [connect]);

  const handlePreviewAim = useCallback((angle: number, power: number, spinX?: number, spinY?: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'preview_aim', angle, power, spinX: spinX || 0, spinY: spinY || 0 }));
    }
  }, []);

  const handleShoot = useCallback((angle: number, power: number, spinX?: number, spinY?: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'shoot', angle, power, spinX: spinX || 0, spinY: spinY || 0 }));
    } else {
      // Offline mode using the same shared physics as the server
      setRoomState((prev: any) => {
        if (!prev) return prev;
        return { ...prev, _pendingOfflineShot: { angle, power } };
      });
    }
  }, []);

  const handleResetCueBall = useCallback((x: number, y: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'reset_cue_ball', x, y }));
    }
  }, []);

  const handleJoinAI = useCallback((difficulty: 'easy' | 'medium' | 'hard' = 'medium') => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'set_ai_opponent', difficulty }));
    }
  }, []);

  const handleSendChat = useCallback((message: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'chat', message }));
    }
  }, []);

  const handleRematch = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'rematch' }));
    } else {
      // Offline rematch — reset balls locally
      setRoomState((prev: any) => {
        if (!prev) return prev;
        const { getInitialBalls } = require('./server/physics');
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
    }
  }, []);

  const handleQuitRoom = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setRoomState(null);
    setPhysicsFrames(null);
    fetchRef.current();
  }, []);

  // إغلاق الاتصال تلقائياً عند إزالة المكون (Unmount)
  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // معالجة التسديد في وضع الأوفلاين خارج setState (React-correct pattern)
  useEffect(() => {
    if (!roomState || !('_pendingOfflineShot' in roomState)) return;
    const pending = (roomState as any)._pendingOfflineShot;
    if (!pending) return;

    // إزالة الحالة المعلقة
    setRoomState((prev: any) => {
      if (!prev) return prev;
      const { _pendingOfflineShot, ...rest } = prev;
      return rest;
    });

    const angle = pending.angle;
    const power = pending.power;
    const balls: Ball[] = roomState.balls.map((b: any) => ({ ...b, vx: 0, vy: 0 }));
    const cueBall = balls.find(b => b.id === 0);
    if (!cueBall) return;

    const forceMag = powerToVelocity(power);
    cueBall.vx = Math.cos(angle) * forceMag;
    cueBall.vy = Math.sin(angle) * forceMag;

    const mockFrames: Array<{ id: number; x: number; y: number; isPocketed: boolean }[]> = [];
    mockFrames.push(captureFrame(balls));

    let iter = 0;
    while (iter < 1200) {
      simulatePhysicsStep(balls);
      mockFrames.push(captureFrame(balls));
      iter++;
      if (!isAnyBallMoving(balls)) break;
    }

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
  }, [roomState]);

  return {
    roomId,
    setRoomId,
    roomState,
    physicsFrames,
    setPhysicsFrames,
    opponentAim,
    handleJoinRoom,
    handlePreviewAim,
    handleShoot,
    handleResetCueBall,
    handleJoinAI,
    handleSendChat,
    handleRematch,
    handleQuitRoom
  };
}