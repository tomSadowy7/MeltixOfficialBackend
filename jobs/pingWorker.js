// jobs/pingWorker.js
import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import { v4 as uuid } from "uuid";

// ⬇️  bring in both helpers from the websocket module
import { sendToPi, pendingPings, pendingPiPings, piSockets, PING_TIMEOUT_MS } from "../websockets/ws-pi.js";

const prisma = new PrismaClient();

cron.schedule("*/1 * * * *", async () => {
  const now = new Date();
  console.log(`[PING] 🔁 Tick — ${now.toISOString()}`);

  // 1) Get all homebases that have at least one device
  const homebases = await prisma.homeBase.findMany({ select: { id: true } });

  console.log(`[PING] 🏠 Found ${homebases.length}`);

  // 2) Ping all Raspberry Pis first
  for (const hb of homebases) {
    const msgId = uuid();
    const sent = sendToPi(hb.id, { type: "pingPi", msgId });
    if (sent) {
      pendingPiPings.set(msgId, {
        homeBaseId: hb.id,
        expiresAt : Date.now() + PING_TIMEOUT_MS
      });
    } else {
      console.warn(`[PING-PI] ❌ Could not reach homebase ${hb.id}`);
      await prisma.$transaction([
        prisma.homeBase.update({
          where: { id: hb.id },
          data : { online: false }
        }),
        prisma.device.updateMany({
          where: { homeBaseId: hb.id },
          data : { online: false }
        })
      ]).catch(console.error);
      }
  }

  // 3) Wait ~1 second before ESP32 ping (give Pis time to respond)
  await waitForPiReplies();



  // ── 3b) Any entries still in pendingPiPings have timed-out ─────────
  for (const [msgId, meta] of pendingPiPings) {
    console.warn(`[PING-PI] ❌ No pong from homebase ${meta.homeBaseId} (msgId=${msgId})`);
    // OPTIONAL: mark offline here if you want
    await prisma.homeBase.update({
      where: { id: meta.homeBaseId },
      data : { online: false }
    }).catch(console.error);

    await prisma.device.updateMany({
      where: { homeBaseId: meta.homeBaseId },
      data : { online: false }
    }).catch(console.error);

    // finally remove so next tick starts clean
    pendingPiPings.delete(msgId);
  }

  // 4) Fetch all devices (with lanName) and group by homebase
    const devices = await prisma.device.findMany({
      where: { lanName: { not: "" } },
      select: { id: true, lanName: true, homeBaseId: true }
    });
    const perHB = devices.reduce((acc, d) => {
      (acc[d.homeBaseId] ??= []).push(d);
      return acc;
    }, {});

    // 4b) Get the set of homebases currently marked online in DB
    const onlineHBIds = new Set(
      (await prisma.homeBase.findMany({
        where: { online: true },
        select: { id: true }
      })).map(h => h.id)
    );
    console.log("[PING-ESP] Considering HB IDs:", Object.keys(perHB));
    console.log("[PING-ESP] Online HB IDs:", [...onlineHBIds]);

    // 5) Only ping ESP devices for homebases that are online *and* have an open socket
    for (const [hbId, devs] of Object.entries(perHB)) {
      if (!onlineHBIds.has(hbId)) {
        console.warn(`[PING-ESP] 🚫 Skipping ESP pings (DB offline) hb=${hbId}`);
        continue;
      }
      const ws = piSockets.get(hbId);
      if (!ws || ws.readyState !== ws.OPEN) {
        console.warn(`[PING-ESP] 🚫 Skipping ESP pings (no socket) hb=${hbId}`);
        continue;
      }

      devs.forEach(d => {
        const msgId = uuid();
        pendingPings.set(msgId, {
          deviceId : d.id,
          expiresAt: Date.now() + PING_TIMEOUT_MS
        });
        const sent = sendToPi(hbId, {
          type   : "pingEsp",
          lanName: d.lanName,
          msgId
        });
        if (!sent) {
          console.warn(`[PING-ESP] ❌ Failed to send ping to device ${d.id}`);
          pendingPings.delete(msgId);
        } else {
          console.log(`[PING-ESP] 🛰️ Sent ping to ${d.lanName}`);
        }
      });
    }

  console.log("[PING] ✅ All pings dispatched\n");
});

async function waitForPiReplies() {
  const step    = 200;                 // poll every 0.2 s
  const giveUp  = Date.now() + PING_TIMEOUT_MS;

  // As long as there are outstanding pings *and* we haven't timed-out
  while (pendingPiPings.size && Date.now() < giveUp) {
    await new Promise(r => setTimeout(r, step));
  }
}
