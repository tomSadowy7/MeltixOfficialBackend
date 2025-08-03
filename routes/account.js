import express from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from './auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// ─────────────────────────────────────────────
// UPDATE USER PROFILE (firstName, lastName, city, state, zip)
// ─────────────────────────────────────────────
router.post('/update', requireAuth, async (req, res) => {
  try {
    const { firstName, lastName, city, state, zip } = req.body;

    const missing = Object.entries({ firstName, lastName, city, state, zip })
      .filter(([, v]) => !v)
      .map(([k]) => k);

    if (missing.length) {
      return res.status(400).json({ error: 'Missing required fields', missing });
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.userId },
      data: { firstName, lastName, city, state, zip },
      select: { id: true, email: true, firstName: true, lastName: true, city: true, state: true, zip: true }
    });

    res.status(200).json({ success: true, user: updatedUser });
  } catch (err) {
    console.error('[Account Update] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;