// scheduler/schedule-runner.js
// ────────────────────────────────────────────────────────────────
// Turns zones ON/OFF every 5 min according to schedules.
// Adds ACK-checking: DB is only updated after the ESP32 confirms.
// ────────────────────────────────────────────────────────────────

import cron               from "node-cron";
import { PrismaClient, RunSource } from "@prisma/client";
import { notifyPiOfSprinklerCmd }  from "../websockets/ws-pi.js";

const prisma = new PrismaClient();

/* -------- small helpers -------------------------------------- */
const zonePatch = (mask, val) => ({
  ...(mask & 1 ? { zone1: val } : {}),
  ...(mask & 2 ? { zone2: val } : {}),
  ...(mask & 4 ? { zone3: val } : {}),
  ...(mask & 8 ? { zone4: val } : {}),
});

/* ============================================================= */
/*  Main cron: every 5 minutes                                   */
/* ============================================================= */
cron.schedule("*/5 * * * *", async () => {
  const now    = new Date();
  const dow    = now.getDay();                            // 0 = Sun … 6 = Sat
  const bucket = Math.floor((now.getHours() * 60 + now.getMinutes()) / 5);

  console.log(`[CRON] ${now.toISOString()} — dow=${dow}, bucket=${bucket}`);

  /* ───────────────────────────────
     1)  SELECT slots that should be ON  ─────────────────────────── */
  const onSlots = await prisma.$queryRaw`
    SELECT ss.*, s."deviceId", s."id"        AS "scheduleId",
           d."homeBaseId", d."lanName"
    FROM   "ScheduleSlot" ss
    JOIN   "Schedule"     s ON s.id = ss."scheduleId"
    JOIN   "Device"       d ON d.id = s."deviceId"
    WHERE  s.enabled = true
      AND  ${dow} = ANY (ss.days)
      AND  ss."startBucket" <= ${bucket}
      AND  ss."startBucket" + ss."bucketCount" > ${bucket};
  `;
  console.log(`[CRON] ▶ ON  slots to start/continue: ${onSlots.length}`);

  /* ---- fire each zone, wait for ACK, then write DB ------------- */
  for (const sl of onSlots) {
    await handleSlot(sl, true /* turnOn */, now);
  }

  /* ───────────────────────────────
     2)  SELECT slots that should turn OFF exactly now ──────────── */
  const offSlots = await prisma.$queryRaw`
    SELECT ss.*, s."deviceId", s."id"        AS "scheduleId",
           d."homeBaseId", d."lanName"
    FROM   "ScheduleSlot" ss
    JOIN   "Schedule"     s ON s.id = ss."scheduleId"
    JOIN   "Device"       d ON d.id = s."deviceId"
    WHERE  s.enabled = true
      AND  ${dow} = ANY (ss.days)
      AND  ss."startBucket" + ss."bucketCount" = ${bucket};
  `;
  console.log(`[CRON] ▶ OFF slots to stop        : ${offSlots.length}`);

  for (const sl of offSlots) {
    await handleSlot(sl, false /* turnOff */, now);
  }

  console.log("[CRON] ✓ pass complete\n");
});

/* ============================================================= */
/*  helper: drive one ScheduleSlot (either ON or OFF)             */
/* ============================================================= */
async function handleSlot(slot, turnOn, ts) {
  const action = turnOn ? "ON" : "OFF";
  const patch  = zonePatch(slot.zoneMask, turnOn);

  for (let z = 1; z <= 4; z++) {
    if (!(slot.zoneMask & (1 << (z - 1)))) continue;

    /* 1. send → await ACK  */
    const ok = await notifyPiOfSprinklerCmd(slot.homeBaseId, {
      lanName : slot.lanName,
      zone    : z,
      on      : turnOn,
      key     : "123456"
    });

    if (!ok) {
      console.warn(`[CRON] ❌ ${action} ACK FAILED — dev ${slot.deviceId}  zone ${z}`);
      continue;                           // skip DB write for this zone
    }

    /* 2. write DB — only after ACK -------------------------------- */
    await prisma.$transaction(async (tx) => {
      if (turnOn) {
        /* close any overlapping runs, then create new run row */
        await tx.runHistory.updateMany({
          where: { deviceId: slot.deviceId, zoneMask: slot.zoneMask, endedAt: null },
          data : { endedAt: ts }
        });
        await tx.runHistory.create({
          data: {
            deviceId  : slot.deviceId,
            zoneMask  : slot.zoneMask,
            startedAt : ts,
            source    : RunSource.SCHEDULE,
            scheduleId: slot.scheduleId
          }
        });
      } else {
        /* mark run ended */
        await tx.runHistory.updateMany({
          where: { deviceId: slot.deviceId, zoneMask: slot.zoneMask, endedAt: null },
          data : { endedAt: ts }
        });
      }

      /* update SprinklerState */
      await tx.sprinklerState.update({
        where: { deviceId: slot.deviceId },
        data : patch
      });
    });

    console.log(`[CRON] ✅ ${action} ACK dev ${slot.deviceId} zone ${z}`);
  }
}
