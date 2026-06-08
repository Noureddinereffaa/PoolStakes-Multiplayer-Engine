import express from 'express';
import helmet from 'helmet';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import net from 'net';
import { registerLaravelRoutes } from './src/server/laravel';
import { broadcastToAllWebSockets } from './src/server/state';
import { attachWebSocketHandlers } from './src/server/websocket';
import { startTurnTimer } from './src/server/turnTimer';
import { logger } from './src/server/logger';
import { xssSanitize } from './src/server/sanitize';
import { requestLogger } from './src/server/logger';
import { restoreRoomSnapshots, startSnapshotInterval, stopSnapshotInterval } from './src/server/persist';

// Webpack/Esbuild-compatible paths config
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const app = express();
const server = createServer(app);

// Enable JSON parser with 50kb body limit to prevent large-payload DoS
app.use(express.json({ limit: '50kb' }));

// Security headers via Helmet (CSP relaxed for dev WebSocket/Vite HMR)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", 'ws://localhost:*', 'http://localhost:*'],
      imgSrc: ["'self'", 'data:'],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
}));

// XSS sanitization for all JSON body string fields
app.use(xssSanitize);

// Request/response logging
app.use(requestLogger);

registerLaravelRoutes(app, broadcastToAllWebSockets);

// WebSocket Server initialization on port 3000
const wss = new WebSocketServer({ noServer: true });
attachWebSocketHandlers(wss);

server.on('upgrade', (request, socket, head) => {
  try {
    const url = request.url || '';
    const pathname = url.split('?')[0];
    
    if (pathname === '/ws' || pathname === '/ws/' || pathname.startsWith('/ws')) {
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
async function getAvailablePort(requestedPort: number, host: string) {
  const maxProbePort = requestedPort + 20;
  for (let port = requestedPort; port <= maxProbePort; port++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const tester = net.createServer();
        tester.once('error', reject);
        tester.listen(port, host, () => {
          tester.close(() => resolve());
        });
      });
      return port;
    } catch {
      continue;
    }
  }
  return requestedPort;
}

async function startServer() {
  const requestedPort = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';

  // Restore rooms from DB snapshots before server starts
  await restoreRoomSnapshots();

  const serverPort = await getAvailablePort(requestedPort, host);
  if (serverPort !== requestedPort) {
    logger.warn(`Port ${requestedPort} was unavailable. Falling back to available port ${serverPort}.`);
  }

  const hmrRequestedPort = Number(process.env.VITE_HMR_PORT ?? 24678);
  const hmrPort = await getAvailablePort(hmrRequestedPort, host);
  if (hmrPort !== hmrRequestedPort) {
    logger.warn(`HMR port ${hmrRequestedPort} was unavailable. Using fallback HMR port ${hmrPort}.`);
  }

  // Vite middleware for lightning-fast HMR and building
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          port: hmrPort
        }
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // SPA routing fallback (Express 5 compatible)
    app.get('/{*any}', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(serverPort, host, () => {
    logger.info(`Server started at http://${host === '0.0.0.0' ? 'localhost' : host}:${serverPort}`);
    startSnapshotInterval();
  }).on('error', (err) => {
    logger.error('Server failed to start', { host, port: serverPort, error: String(err) });
  });
}

// Graceful shutdown: save final snapshots and clean up
process.on('SIGINT', async () => {
  logger.info('Shutting down...');
  stopSnapshotInterval();
  const { activeRooms } = require('./src/server/state');
  const { saveRoomSnapshot } = require('./src/server/persist');
  for (const room of activeRooms.values()) {
    if (room.status === 'playing' || room.status === 'waiting') {
      await saveRoomSnapshot(room);
    }
  }
  process.exit(0);
});

startServer();
