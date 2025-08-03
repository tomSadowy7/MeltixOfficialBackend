import express from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateToken } from "../authMiddleware.js";
import { notifyPiOfSprinklerCmd } from "../websockets/ws-pi.js";

const prisma = new PrismaClient();
const router = express.Router();

/* ---------- GET current state ---------- */
router.get("/:deviceId", authenticateToken, async (req, res) => {
  const state = await prisma.sprinklerState.findUnique({
    where: { deviceId: req.params.deviceId }
  });
  if (!state) return res.status(404).json({ error: "No state" });
  res.json({
    zone1: state.zone1,
    zone2: state.zone2,
    zone3: state.zone3,
    zone4: state.zone4
  });
});

/* ---------- POST zone toggle ---------- */
router.post("/:deviceId/zone/:zone", authenticateToken, async (req, res) => {
  const zone = Number(req.params.zone);
  if (![1, 2, 3, 4].includes(zone)) {
    console.warn(`[API] Invalid zone requested: ${zone}`);
    return res.status(400).json({ error: "Bad zone" });
  }

  const on = !!req.body.on;
  const deviceId = req.params.deviceId;
  console.log(`[API] Request to turn ${on ? "ON" : "OFF"} zone ${zone} on device ${deviceId}`);

  const dev = await prisma.device.findUnique({ where: { id: deviceId } });

  try {
    const success = await notifyPiOfSprinklerCmd(dev.homeBaseId, {
      lanName: dev.lanName,
      zone,
      on,
      key: "123456"
    });

    if (!success) {
      console.warn(`[API] ESP32 did NOT confirm zone ${zone} toggle on ${dev.lanName}`);
      throw new Error("ESP32 failed or unreachable");
    }

    const fields = { [`zone${zone}`]: on };
    await prisma.sprinklerState.update({
      where: { deviceId },
      data: fields
    });

    console.log(`[API] Successfully toggled zone ${zone} ${on ? "ON" : "OFF"} and updated DB for ${deviceId}`);
    res.json({ success: true });
  } catch (e) {
    console.error(`[API] Sprinkler command failed for device ${deviceId}, zone ${zone}:`, e?.message || e);
    res.status(500).json({ error: "Sprinkler device did not respond" });
  }
});

export default router;