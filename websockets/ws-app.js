// routes/ws-app.js
import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';

export const appSockets = new Map(); // homebaseId -> ws

export function notifyAppOfProvisioning(homebaseId, { name, uuid, deviceType, lanName, online }) {
  const ws = appSockets.get(homebaseId);
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({
      type: 'devicePaired',
      device: {
        name,
        id: uuid,
        type: deviceType,
        lanName,      // ✅ include this
        online        // ✅ and this
      }
    }));
  }
}

export function createAppWebSocketServer(port = 8082) {
  const wss = new WebSocketServer({ port });

  wss.on('connection', (ws, req) => {
    // Parse token from query string
    const url = new URL(req.url, `ws://${req.headers.host}`);
    const token = url.searchParams.get('token');
    if (!token) {
      ws.close();
      return;
    }
    // Validate JWT
    let userId = null;
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      userId = payload.userId;
    } catch {
      ws.close();
      return;
    }

    ws.once('message', (msg) => {
      let data;
      try { data = JSON.parse(msg); } catch { ws.close(); return; }
      if (data.type === 'watchProvisioning' && data.homebaseId) {
        appSockets.set(data.homebaseId, ws);
        ws._homebaseId = data.homebaseId;
        ws._userId = userId;
        console.log(`[WebSocket] App connected: ${data.homebaseId}`);

        // ---- extra debug ----
        ws.on('close', (code, reason) => {
          appSockets.delete(data.homebaseId);
          console.log(
            `[WS-APP] 🔌 closed homebase ${data.homebaseId} ` +
            `(code ${code}${reason ? `, reason: ${reason}` : ''})`
          );
        });

        ws.on('error', (err) => {
          appSockets.delete(data.homebaseId);
          console.error(`[WS-APP] ⚠️  error on ${data.homebaseId}:`, err.message);
        });

      } else {
        ws.close();
      }
    });
  });

  wss.on('listening', () => {
    console.log(`[WS] App WebSocket server listening on ws://localhost:${port}/`);
  });
}
