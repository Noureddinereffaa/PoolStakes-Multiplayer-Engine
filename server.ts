import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { registerLaravelRoutes } from './src/server/laravel';
import { broadcastToAllWebSockets } from './src/server/state';
import { attachWebSocketHandlers } from './src/server/websocket';
import { startTurnTimer } from './src/server/turnTimer';

// Webpack/Esbuild-compatible paths config
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const app = express();
const server = createServer(app);

// Enable JSON parser for Laravel mock API routes
app.use(express.json());

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
async function startServer() {
  // Vite middleware for lightning-fast HMR and building
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          port: Number(process.env.VITE_HMR_PORT ?? 24678)
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

  server.listen(PORT, HOST, () => {
    console.log(`Pool autorative game & betting platform server starts at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  }).on('error', (err) => {
    console.error(`Server failed to start on ${HOST}:${PORT}:`, err);
  });
}

startServer();
