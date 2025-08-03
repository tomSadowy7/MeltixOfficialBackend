// websocket.js
import { WebSocketServer } from 'ws';

export const piSockets = new Map();   // homebaseId -> WebSocket (for Pi)
export const appSockets = new Map();  // homebaseId -> WebSocket (for App)

// Used by your HTTP endpoints to notify the app of new device
// Used by your HTTP endpoints to notify the app of new device
export function notifyAppOfProvisioning(homebaseId, { name, uuid, deviceType }) {
  const ws = appSockets.get(homebaseId);
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({
      type: 'devicePaired',
      device: {
        name,
        uuid,
        deviceType
      }
    }));
  }
}

export function createPiWebSocketServer(port = 8081) {
  const wss = new WebSocketServer({ port });

  wss.on('connection', (ws, req) => {
    ws.once('message', (msg) => {
      let data;
      try { data = JSON.parse(msg); } catch { ws.close(); return; }

      // ---- Pi registers itself ----
      if (data.type === 'register' && data.homebaseId) {
        const homebaseId = data.homebaseId;
        piSockets.set(homebaseId, ws);
        ws._homebaseId = homebaseId;
        console.log(`[WebSocket] Pi connected: ${homebaseId}`);

        ws.on('close', () => {
          piSockets.delete(homebaseId);
          console.log(`[WebSocket] Pi disconnected: ${homebaseId}`);
        });
        ws.on('error', () => {
          piSockets.delete(homebaseId);
        });

        // Pi can notify about device provisioning
        ws.on('message', (message) => {
          try {
            const evt = JSON.parse(message);
            // Only handle if type is devicePaired
            if (evt.type === 'devicePaired' && evt.device) {
              notifyAppOfProvisioning(homebaseId, evt.device);
            }
          } catch {}
        });
      }

      // ---- App registers as watcher ----
      else if (data.type === 'watchProvisioning' && data.homebaseId) {
        const homebaseId = data.homebaseId;
        appSockets.set(homebaseId, ws);
        ws._homebaseId = homebaseId;
        console.log(`[WebSocket] App connected (watching provisioning): ${homebaseId}`);

        ws.on('close', () => {
          appSockets.delete(homebaseId);
          console.log(`[WebSocket] App disconnected: ${homebaseId}`);
        });
        ws.on('error', () => {
          appSockets.delete(homebaseId);
        });
      }

      else {
        ws.close();
      }
    });
  });

  wss.on('listening', () => {
    console.log(`[WebSocket] Pi/App WebSocket server listening on ws://localhost:${port}/`);
  });

  return wss;
}
