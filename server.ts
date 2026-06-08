import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import net from 'net';
import { registerLaravelRoutes } from './src/server/laravel';
import { broadcastToAllWebSockets } from './src/server/state';
import { attachWebSocketHandlers } from './src/server/websocket';
import { startTurnTimer } from './src/server/turnTimer';

// Webpack/Esbuild-compatible paths config
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const app = express();
const server = createServer(app);

// Enable JSON parser with 50kb body limit to prevent large-payload DoS
app.use(express.json({ limit: '50kb' }));

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
    console.error('WebSocket upgrade error:', err);
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
  const serverPort = await getAvailablePort(requestedPort, host);
  if (serverPort !== requestedPort) {
    console.warn(`Port ${requestedPort} was unavailable. Falling back to available port ${serverPort}.`);
  }

  const hmrRequestedPort = Number(process.env.VITE_HMR_PORT ?? 24678);
  const hmrPort = await getAvailablePort(hmrRequestedPort, host);
  if (hmrPort !== hmrRequestedPort) {
    console.warn(`HMR port ${hmrRequestedPort} was unavailable. Using fallback HMR port ${hmrPort}.`);
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
    // SPA routing fallback
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(serverPort, host, () => {
    console.log(`Pool autorative game & betting platform server starts at http://${host === '0.0.0.0' ? 'localhost' : host}:${serverPort}`);
  }).on('error', (err) => {
    console.error(`Server failed to start on ${host}:${serverPort}:`, err);
  });
}

startServer();
