import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { PrismaClient } from "@prisma/client";

export const piSockets = new Map(); // homebaseId -> ws
export const pendingPings = new Map(); // msgId -> { deviceId, expiresAt }
export const pendingPiPings = new Map(); // msgId -> { homeBaseId, expiresAt }
export const PING_TIMEOUT_MS = 20_000;

const prisma = new PrismaClient();


export const sendToPi = (homebaseId, payload) => {
  const ws = piSockets.get(homebaseId);
  if (!ws || ws.readyState !== ws.OPEN) return false;
  ws.send(JSON.stringify(payload));
  return true;
};



export function notifyPiOfSprinklerCmd(homebaseId, payload) {
  const ws = piSockets.get(homebaseId);
  if (!ws || ws.readyState !== ws.OPEN) return Promise.reject("No socket");

  return new Promise((resolve, reject) => {
    const msgId = Math.random().toString(36).slice(2);
    const listener = (msg) => {
      try {
        const data = JSON.parse(msg);
        if (data.type === "sprinklerAck" && data.msgId === msgId) {
          ws.off("message", listener);
          resolve(data.success);
        }
      } catch {}
    };
    ws.on("message", listener);
    ws.send(JSON.stringify({ type: "sprinklerCmd", msgId, ...payload }));

    setTimeout(() => {
      ws.off("message", listener);
      reject("Timeout waiting for ack from Pi");
    }, 5000);
  });
}

export function createPiWebSocketServer(port = 8081) {
  const wss = new WebSocketServer({ port });

  wss.on('connection', (ws, req) => { (async () => {
    const url = new URL(req.url, `ws://${req.headers.host}`);
    const token = url.searchParams.get('token');
    if (!token) return ws.close();


    /*
    let userId = null;
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      userId = payload.userId;
    } catch {
      return ws.close();
    }
      */
    
    const homebase = await prisma.homeBase.findFirst({
      where: {homebaseToken: token},
      include: {user: true}
    });

    if (!homebase) return ws.close(1008, 'Invalid homebase token')
    })


    ws.on('message', async (msg) => {
      let data;
      try {
        data = JSON.parse(msg);
      } catch {
        return ws.close(1003, "Invalid JSON");
      }

      if (data.type === 'register' && data.homebaseId) {
        piSockets.set(data.homebaseId, ws);
        ws._homebaseId = data.homebaseId;
        console.log(`[WebSocket] Homebase connected: ${data.homebaseId}`);
        return;
      }

      if (data.type === "pongEsp") {
        const meta = pendingPings.get(data.msgId);
        if (meta) {
          pendingPings.delete(data.msgId);
          console.log(`[PING-ESP32] Received pong for device ${meta.deviceId} — ONLINE: ${data.online}`);

          await prisma.device.update({
            where: { id: meta.deviceId },
            data : {
              online: data.online
            }
          }).catch((err) => {
            console.error(`[PING] Failed to update device ${meta.deviceId} online status:`, err);
          });
        } else {
          console.warn(`[PING] Received pong with unknown msgId: ${data.msgId}`);
        }
        return;
      }
      if (data.type === "pongPi") {
        const hbId = ws._homebaseId;
        if (hbId) {
          // 🧹 cleanup ping
          for (const [msgId, meta] of pendingPiPings.entries()) {
            if (meta.homeBaseId === hbId) {
              pendingPiPings.delete(msgId);
            }
          }

          console.log(`[PING-PI] ✅ Homebase ${hbId} is ONLINE`);
          await prisma.homeBase.update({
            where: { id: hbId },
            data : {
              online     : true,
              lastPingAt : new Date()
            }
          }).catch(console.error);
        }
        return;
      }

      // You can handle more types here if needed
    });

    ws.on('close', (code, reason) => {
      const hbId = ws._homebaseId;
      if (hbId) {
        piSockets.delete(hbId);
        console.log(`[WS-PI] 🔌 closed homebase ${hbId} (code ${code}${reason ? `, reason: ${reason}` : ''})`);
      }
    });

    ws.on('error', (err) => {
      const hbId = ws._homebaseId;
      if (hbId) piSockets.delete(hbId);
      console.error(`[WS-PI] ⚠️  error on ${hbId}:`, err.message);
    });
  });

  // Cleanup expired pings
  setInterval(async () => {
    const now = Date.now();
    for (const [id, meta] of pendingPings) {
      if (now > meta.expiresAt) {
        pendingPings.delete(id);
        await prisma.device.update({
          where: { id: meta.deviceId },
          data : { online: false }
        }).catch(console.error);
      }
    }
  }, 60_000);

  setInterval(async () => {
    const now = Date.now();
    for (const [msgId, meta] of pendingPiPings) {
      if (now > meta.expiresAt) {
        pendingPiPings.delete(msgId);
        await prisma.homeBase.update({
          where: { id: meta.homeBaseId },
          data : { online: false }
        }).catch(console.error);
        console.warn(`[PING-PI] ❌ Timed out: Homebase ${meta.homeBaseId} marked OFFLINE`);
      }
    }
  }, 60_000);

  wss.on('listening', () => {
    console.log(`[WS] Pi WebSocket server listening on ws://localhost:${port}/`);
  });
}

