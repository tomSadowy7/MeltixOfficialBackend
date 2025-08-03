// POST /api/device/register
import { PrismaClient } from "@prisma/client";
import { authenticateToken } from '../authMiddleware.js';
import { appSockets, notifyAppOfProvisioning } from '../websockets/ws-app.js'; // Update path if needed
import express from "express";
const router = express.Router();
const prisma = new PrismaClient();


router.post("/register", async (req, res) => {
  const { homeBaseId, deviceId, name, type, lanName, online } = req.body;

  if (!homeBaseId || !deviceId || !name || !type || !lanName) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  try {
    // Upsert device
    const device = await prisma.device.upsert({
      where:  { id: deviceId },
      update: { name, type, homeBaseId, lanName, online },     // ← add here
      create: {
        id: deviceId,
        name,
        type,
        lanName,                                       // ← and here
        homeBase: { connect: { id: homeBaseId } },
        online
      }
    });

    console.log('hit here')
    console.log('device', device)
        // ─────────── Sprinkler 1-to-1 state ───────────
    if (device.type === "sprinkler") {
      await prisma.sprinklerState.upsert({
        where:   { deviceId: device.id },   // PK == FK
        update:  {},                        // nothing to update on re-provision
        create:  { deviceId: device.id }    // all zones default to false
      });
    }


    // Debug what we are about to notify
    console.log("[/register] NOT UPDATED Notifying app of new device:", {
      name: device.name,
      uuid: device.id,
      deviceType: device.type,
      online: device.online,
      homeBaseId
    });

    // Notify the app via WebSocket
    notifyAppOfProvisioning(homeBaseId, {
      name: device.name,
      uuid: device.id,
      deviceType: device.type,
      lanName: device.lanName,     // ✅ added
      online: device.online
    });

    res.json({ success: true, device });
  } catch (e) {
    console.error("[/register] Error:", e);
    res.status(500).json({ error: "Failed to register device" });
  }
});


// routes/device.js (add this route)
router.get('/list', authenticateToken, async (req, res) => {
  console.log('hit devices/list')
  try {
    // get the homebase
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { homebase: { include: { devices: true } }, }
    });
    if (!user?.homebase) {
      return res.status(404).json({ error: 'No HomeBase for user' });
    }
    res.json({ success: true, devices: user.homebase.devices });
  } catch (e) {
    res.status(500).json({ error: 'Failed to get devices' });
  }
});



export default router;
