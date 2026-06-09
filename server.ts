import express from 'express';
import helmet from 'helmet';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import net from 'net';
import { registerLaravelRoutes } from './src/server/laravel';
import { broadcastToAllWebSockets } from './src/server/state';
import { attachWebSocketHandlers } from './src/server/websocket';
import { startTurnTimer } from './src/server/turnTimer';
import { logger } from './src/server/logger';
import { xssSanitize } from './src/server/sanitize';
import { requestLogger } from './src/server/logger';
import { restoreRoomSnapshots, saveRoomSnapshot, startSnapshotInterval, stopSnapshotInterval } from './src/server/persist';
import { activeRooms } from './src/server/state';

// ── Validate required env vars before anything else ────────────
function validateEnv(): void {
  const required = ['DATABASE_URL', 'JWT_SECRET'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error(`FATAL: Missing required environment variables: ${missing.join(', ')}`);
    process.exit(2);
  }
  if ((process.env.JWT_SECRET || '').length < 32) {
    console.error('FATAL: JWT_SECRET must be at least 32 characters long');
    process.exit(2);
  }
}
validateEnv();

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const app = express();

// Enable JSON parser with 10kb body limit to prevent large-payload DoS
app.use(express.json({ limit: '10kb' }));

// Security headers via Helmet — production-hardened CSP
const isDev = process.env.NODE_ENV !== 'production';
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", ...(isDev ? ['ws://localhost:*', 'http://localhost:*'] : [])],
      imgSrc: ["'self'", 'data:'],
      scriptSrc: ["'self'", ...(isDev ? ["'unsafe-inline'"] : [])],
      styleSrc: ["'self'", "'unsafe-inline'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(xssSanitize);
app.use(requestLogger);

// ── Global Express error handler ───────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: String(err) });
  res.status(500).json({ success: false, error: 'Internal server error' });
});

registerLaravelRoutes(app, broadcastToAllWebSockets);

// WebSocket Server
const wss = new WebSocketServer({ noServer: true });
attachWebSocketHandlers(wss);

const server = createServer(app);

server.on('upgrade', (request, socket, head) => {
  try {
    const url = request.url || '';
    const pathname = url.split('?')[0];
    if (pathname === '/ws' || pathname.startsWith('/ws')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  } catch (err) {
    logger.error('WebSocket upgrade error', { error: String(err) });
  }
});

startTurnTimer();

// ==========================================
// SPA Static Routing & Vite Configuration
// ==========================================
async function startServer() {
  const serverPort = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';

  await restoreRoomSnapshots();

  if (isDev) {
    const hmrPort = Number(process.env.VITE_HMR_PORT ?? 24678);
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: { port: hmrPort } },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.use((_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(serverPort, host, () => {
    logger.info(`Server started at http://${host === '0.0.0.0' ? 'localhost' : host}:${serverPort}`);
    startSnapshotInterval();
  }).on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(`Port ${serverPort} is already in use. Try a different PORT.`);
    } else {
      logger.error('Server failed to start', { host, port: serverPort, error: String(err) });
    }
    process.exit(1);
  });
}

// Graceful shutdown — handle both SIGINT and SIGTERM
async function gracefulShutdown() {
  logger.info('Shutting down...');
  stopSnapshotInterval();
  const saves = [];
  for (const room of activeRooms.values()) {
    if (room.status === 'playing' || room.status === 'waiting') {
      saves.push(saveRoomSnapshot(room));
    }
  }
  await Promise.all(saves);
  process.exit(0);
}
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

startServer().catch((err) => {
  logger.error('Server startup failed', { error: String(err) });
  process.exit(1);
});
