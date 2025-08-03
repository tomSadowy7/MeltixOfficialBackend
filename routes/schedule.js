import express from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateToken } from "../authMiddleware.js";

const prisma = new PrismaClient();
const router = express.Router();

// ───────── helpers ─────────
const toBucket = (hhmm) => {              // "06:30" -> 78
  const [h, m] = hhmm.split(':').map(Number);
  if (m % 5) throw new Error("time must be 5-min aligned");
  return (h * 60 + m) / 5;
};
const minsToBuckets = (min) => {
  if (min % 5) throw new Error("duration must be multiple of 5");
  return min / 5;
};
const toMask = (zones) =>
  zones.reduce((m, z) => {
    if (![1, 2, 3, 4].includes(z)) throw new Error("bad zone");
    return m | (1 << (z - 1));
  }, 0);



// ───────── CRUD routes ─────────

const bucketToHHMM = (b) => {
  const mins = b * 5;
  const h    = Math.floor(mins / 60).toString().padStart(2, "0");
  const m    = (mins % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
};
const maskToZones = (mask) => [1, 2, 3, 4].filter(z => mask & (1 << (z - 1)));

// ...imports and helpers stay the same...

// GET /api/schedule?deviceId=...
router.get("/", authenticateToken, async (req, res) => {
  console.log("[GET /api/schedule]", req.query);
  const rows = await prisma.schedule.findMany({
    where:   { deviceId: req.query.deviceId },
    include: { slots: true }
  });

  const shaped = rows.map(s => ({
    id        : s.id,
    name      : s.name,
    enabled   : s.enabled,
    rainGuard : s.rainGuard,
    deviceId  : s.deviceId,
    slots: s.slots.map(sl => ({
      id         : sl.id,
      days       : sl.days, // now an array
      start      : bucketToHHMM(sl.startBucket),
      durationMin: sl.bucketCount * 5,
      zones      : maskToZones(sl.zoneMask)
    }))
  }));

  console.log("[GET /api/schedule] returning", shaped.length, "schedules");
  res.json(shaped);
});

// POST /api/schedule
router.post("/", authenticateToken, async (req, res) => {
  try {
    console.log("[POST /api/schedule] body:", req.body);
    const { deviceId, name, enabled, rainGuard = false, slots } = req.body;

    const already = await prisma.schedule.count({ where: { deviceId } });
    if (already >= 3) {
      console.log("[POST /api/schedule] already has 3 schedules");
      return res.status(400).json({ error: "device already has 3 schedules" });
    }

    const slotData = slots.map((s) => ({
    days: s.days,                                 // ← CHANGE THIS LINE
    startBucket: toBucket(s.start),
    bucketCount: minsToBuckets(s.durationMin),
    zoneMask: toMask(s.zones)
  }));

    console.log("[POST /api/schedule] slotData:", slotData);

    const schedule = await prisma.schedule.create({
      data: {
        name,
        rainGuard,
        enabled,
        device: { connect: { id: deviceId } },
        createdBy: req.userId,
        slots: { create: slotData }
      },
      include: { slots: true }
    });
    console.log("[POST /api/schedule] created", schedule.id);
    res.json(schedule);
  } catch (e) {
    console.error("[POST /api/schedule] ERROR:", e);
    res.status(400).json({ error: e.message });
  }
});

// PUT /api/schedule/:id
router.put("/:id", authenticateToken, async (req, res) => {
  const { name, enabled, rainGuard, slots } = req.body;
  console.log("[PUT /api/schedule]", req.params.id, "body:", req.body);
  try {
    // delete old slots, then recreate – simplest
    await prisma.scheduleSlot.deleteMany({ where: { scheduleId: req.params.id } });
    console.log("[PUT /api/schedule] deleted old slots for schedule", req.params.id);

    const slotData = slots.map((s) => ({
      days: s.days, // now an array, e.g. [1, 3, 5]
      startBucket: toBucket(s.start),
      bucketCount: minsToBuckets(s.durationMin),
      zoneMask: toMask(s.zones)
    }));

    console.log("[PUT /api/schedule] slotData:", slotData);

    const sched = await prisma.schedule.update({
      where: { id: req.params.id },
      data: {
        name,
        enabled,
        rainGuard,
        slots: { createMany: { data: slotData } }
      },
      include: { slots: true }
    });
    console.log("[PUT /api/schedule] updated schedule", sched.id);
    res.json(sched);
  } catch (e) {
    console.error("[PUT /api/schedule] ERROR:", e);
    res.status(400).json({ error: e.message });
  }
});

// DELETE /api/schedule/:id
router.delete("/:id", authenticateToken, async (req, res) => {
  console.log("[DELETE /api/schedule]", req.params.id);
  await prisma.schedule.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

export default router;