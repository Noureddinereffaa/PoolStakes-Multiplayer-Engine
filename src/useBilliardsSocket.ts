import { useState, useRef, useEffect, useCallback } from 'react';
import { RoomState } from './types';

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

  const handleJoinRoom = useCallback((targetRoomId: string, customStake: number, autoJoinAI: boolean | 'easy' | 'medium' | 'hard' = false) => {
    setRoomId(targetRoomId);
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
            setPhysicsFrames(msg.frames);
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

    ws.onerror = () => {
    };
  }, []);

  const handlePreviewAim = useCallback((angle: number, power: number, spinX?: number, spinY?: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'preview_aim', angle, power, spinX: spinX || 0, spinY: spinY || 0 }));
    }
  }, []);

  const handleShoot = useCallback((angle: number, power: number, spinX?: number, spinY?: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'shoot', angle, power, spinX: spinX || 0, spinY: spinY || 0 }));
    } else {
      // محاكاة إطلاق الكرة بفيزياء ثنائية الأبعاد للحصول على تصادم واقعي (محلياً)
      setRoomState((prev: any) => {
        if (!prev) return prev;

        // نسخ الكرات للبدء في حسابات الحركة
        const balls = prev.balls.map((b: any) => ({ ...b, vx: 0, vy: 0 }));
        const cueBall = balls.find((b: any) => b.id === 0);
        if (!cueBall) return prev;

        // تحويل قوة الضربة إلى سرعة مبدئية للكرة البيضاء
        cueBall.vx = Math.cos(angle) * (power * 0.4);
        cueBall.vy = Math.sin(angle) * (power * 0.4);

        const mockFrames = [];
        const BALL_RADIUS = 10;
        const TABLE_WIDTH = 800; // العرض الافتراضي
        const TABLE_HEIGHT = 400; // الطول الافتراضي
        const FRICTION = 0.985; // معامل الاحتكاك (Friction)
        const CUSHION = 20; // عرض حافة الطاولة
        const POCKET_RADIUS = 24; // نصف قطر فتحة الحفرة

        // إحداثيات مراكز الحفر الستة
        const pocketCenters = [
          { x: CUSHION + 4, y: CUSHION + 4 },
          { x: TABLE_WIDTH / 2, y: CUSHION + 1 },
          { x: TABLE_WIDTH - CUSHION - 4, y: CUSHION + 4 },
          { x: CUSHION + 4, y: TABLE_HEIGHT - CUSHION - 4 },
          { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT - CUSHION - 1 },
          { x: TABLE_WIDTH - CUSHION - 4, y: TABLE_HEIGHT - CUSHION - 4 }
        ];

        let isMoving = true;
        let iter = 0;

        mockFrames.push(balls.map((b: any) => ({ id: b.id, x: b.x, y: b.y, isPocketed: b.isPocketed })));

        // حلقة محاكاة الفيزياء حتى تتوقف جميع الكرات
        while (isMoving && iter < 500) {
          isMoving = false;
          iter++;

          for (const b of balls) {
            if (b.isPocketed) continue;

            b.x += b.vx;
            b.y += b.vy;
            b.vx *= FRICTION;
            b.vy *= FRICTION;

            if (Math.abs(b.vx) > 0.05 || Math.abs(b.vy) > 0.05) isMoving = true;
            else { b.vx = 0; b.vy = 0; }

            // التحقق من سقوط الكرة في إحدى الحفر
            for (const pocket of pocketCenters) {
              const dx = b.x - pocket.x;
              const dy = b.y - pocket.y;
              if (dx * dx + dy * dy < POCKET_RADIUS * POCKET_RADIUS) {
                b.isPocketed = true;
                b.vx = 0;
                b.vy = 0;
                break;
              }
            }
            if (b.isPocketed) continue; // إذا سقطت الكرة، تخطى حسابات الارتداد

            // الارتداد من حواف الطاولة
            const minX = CUSHION + BALL_RADIUS;
            const maxX = TABLE_WIDTH - CUSHION - BALL_RADIUS;
            const minY = CUSHION + BALL_RADIUS;
            const maxY = TABLE_HEIGHT - CUSHION - BALL_RADIUS;
            if (b.x < minX) { b.x = minX; b.vx *= -1; } else if (b.x > maxX) { b.x = maxX; b.vx *= -1; }
            if (b.y < minY) { b.y = minY; b.vy *= -1; } else if (b.y > maxY) { b.y = maxY; b.vy *= -1; }
          }

          // حساب اصطدام الكرات ببعضها (Elastic Collisions)
          for (let i = 0; i < balls.length; i++) {
            for (let j = i + 1; j < balls.length; j++) {
              const b1 = balls[i];
              const b2 = balls[j];
              if (b1.isPocketed || b2.isPocketed) continue;

              const dx = b2.x - b1.x;
              const dy = b2.y - b1.y;
              const dist = Math.sqrt(dx * dx + dy * dy);

              if (dist < BALL_RADIUS * 2) {
                // تصحيح تداخل الكرات
                const overlap = (BALL_RADIUS * 2 - dist) / 2;
                const nx = dx / dist;
                const ny = dy / dist;
                b1.x -= nx * overlap;
                b1.y -= ny * overlap;
                b2.x += nx * overlap;
                b2.y += ny * overlap;

                // تبادل قوة الدفع بين الكرتين
                const kx = b1.vx - b2.vx;
                const ky = b1.vy - b2.vy;
                const p = (nx * kx + ny * ky);

                b1.vx -= p * nx;
                b1.vy -= p * ny;
                b2.vx += p * nx;
                b2.vy += p * ny;
              }
            }
          }

          // تسجيل الإحداثيات بمعدل معين لتخفيف الضغط على واجهة المستخدم
          if (iter % 3 === 0) {
            mockFrames.push(balls.map((b: any) => ({ id: b.id, x: b.x, y: b.y, isPocketed: b.isPocketed })));
          }
        }

        // الإطار النهائي
        mockFrames.push(balls.map((b: any) => ({ id: b.id, x: b.x, y: b.y, isPocketed: b.isPocketed })));
        setPhysicsFrames(mockFrames as any);

        const nextTurn = prev.currentTurn === prev.players[0]?.id ? (prev.players[1]?.id || prev.players[0].id) : prev.players[0]?.id;

        return {
          ...prev,
          currentTurn: nextTurn,
          balls: balls.map((b: any) => ({ ...b, vx: 0, vy: 0 })), // تحديث مواقع الكرات وإيقاف سرعتها بالكامل
          log: [...prev.log, `[Offline] Shot fired with ${power}% power.`]
        };
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
    handleQuitRoom
  };
}