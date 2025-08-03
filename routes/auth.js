import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { sendVerificationEmail, sendResetEmail } from './email.js';
import { addMinutes, isAfter } from 'date-fns';
import {randomBytes } from 'crypto'


const router = express.Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

const CODE_LIFETIME_MIN = 30;

// ──────────────────────────────────────────────────────────
// Helper: Generate 8-digit verification code
const generateVerificationCode = () =>
  Math.floor(10000000 + Math.random() * 90000000).toString();

export function generateHomeBaseToken() {
  return randomBytes(32).toString('base64url')
}

// ──────────────────────────────────────────────────────────
// Middleware: JWT authentication (for protected routes)
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// ──────────────────────────────────────────────────────────
// SIGN-UP — creates user, sends email, returns token + isVerified
// ──────────────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
  try {
    const { email, password, firstName, lastName, city, state, zip } = req.body;

    const missing = Object.entries({ email, password, firstName, lastName, city, state, zip })
      .filter(([, v]) => !v)
      .map(([k]) => k);
    if (missing.length) {
      return res.status(400).json({ error: 'Missing required fields', missing });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationCode = generateVerificationCode();

    const newUser = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        city,
        state,
        zip,
        isVerified: false,
        verificationCode
      },
      select: {
        id: true, email: true,
        firstName: true, lastName: true,
        city: true, state: true, zip: true,   // ← add these
        createdAt: true, isVerified: true
      }
    });

    await sendVerificationEmail(email, verificationCode);

    const token = jwt.sign({ userId: newUser.id }, JWT_SECRET, { expiresIn: '24h' });

    res.status(201).json({
      success: true,
      token,
      isVerified: newUser.isVerified,
      user: newUser
    });

  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────────────────
// LOGIN — always returns token + isVerified
// ──────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────
// LOGIN — always returns token + isVerified
// ──────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, password: true, firstName: true, city: true, state: true, zip: true,lastName: true, createdAt: true, isVerified: true }
    });

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    // If not verified, generate + send new code automatically
    if (!user.isVerified) {
      const newCode = generateVerificationCode();
      await prisma.user.update({
        where: { id: user.id },
        data: { verificationCode: newCode }
      });
      await sendVerificationEmail(user.email, newCode);
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });

    res.status(200).json({
      success: true,
      token,
      isVerified: user.isVerified,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        city: user.city,
        state: user.state,
        zip: user.zip,
        lastName: user.lastName,
        createdAt: user.createdAt
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────────────────
// VERIFY EMAIL — validate code, mark verified
// ──────────────────────────────────────────────────────────
router.post('/verify', async (req, res) => {
  const { email, code } = req.body;
  console.log("Verify request:", { email, code });
  const user = await prisma.user.findUnique({ where: { email } });
  console.log("Verify user:", user?.email, "code:", code);
  if (!user || user.verificationCode !== code) {
    return res.status(400).json({ error: 'Invalid verification code' });
  }

  await prisma.user.update({
    where: { email },
    data: { isVerified: true, verificationCode: null }
  });

  res.status(200).json({ success: true, isVerified: true });
});

// ──────────────────────────────────────────────────────────
// RESEND VERIFICATION — protected (requires auth token)
// ──────────────────────────────────────────────────────────
router.post('/resend-verification', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });

    if (!user) return res.status(400).json({ error: "User not found" });
    if (user.isVerified) return res.status(400).json({ error: "User already verified" });

    const newCode = generateVerificationCode();

    await prisma.user.update({
      where: { id: user.id },
      data : { verificationCode: newCode }
    });

    await sendVerificationEmail(user.email, newCode);
    res.status(200).json({ success: true, message: "New verification code sent" });

  } catch (err) {
    console.error("Resend verification error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


// ─────────────────────────────────────────────────────
// FORGOT PASSWORD → email user reset code
// ─────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────
// RESET PASSWORD → submit code + new password
// ─────────────────────────────────────────────────────
router.post('/verify-reset-code', async (req, res) => {
  const { email, code } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.resetCode !== code) {
    return res.status(400).json({ error: 'Invalid reset code' });
  }
  return res.status(200).json({ success: true });
});


/**
 * POST /auth/forgot-password
 * Body: { email }
 *
 * Always returns 200 { success:true } to avoid leaking which e-mails exist.
 */


router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    console.log("─ Reset-PW req ─", { email, code, newPasswordLen: newPassword?.length });

    // 1. sanity
    if (!email || !code || !newPassword) {
      console.log("Missing fields");
      return res.status(400).json({ error: "Missing fields" });
    }

    // 2. user lookup
    const user = await prisma.user.findUnique({ where: { email }});
    console.log("User?", !!user, "storedCode:", user?.resetCode, "expires:", user?.resetCodeExpires);

    if (!user) {
      return res.status(400).json({ error: "Invalid reset request" });
    }

    // 3. expiry check (comment out if you removed resetCodeExpires)
    if (user.resetCodeExpires && Date.now() > user.resetCodeExpires) {
      console.log("Code expired");
      return res.status(400).json({ error: "Code expired" });
    }

    // 4. code match
    if (user.resetCode !== code) {
      console.log("Bad code");
      return res.status(400).json({ error: "Invalid reset code" });
    }

    // 5. update PW
    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { email },
      data : { password: hashed, resetCode: null, resetCodeExpires: null }
    });

    console.log("✅ Password updated");
    res.json({ success: true });
  } catch (err) {
    console.error("reset-password fatal:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  // 1. Validate input
  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  // 2. Look up user — but NEVER reveal if they exist
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Respond success anyway
    return res.status(200).json({ success: true });
  }

  // 3. Generate & store reset code + expiry
  const code = generateVerificationCode();

  await prisma.user.update({
    where: { email },
    data : {
      resetCode       : code,
      resetCodeExpires: addMinutes(new Date(), CODE_LIFETIME_MIN) // comment out if you don’t need expiry
    }
  });

  // 4. Send the e-mail
  await sendResetEmail(email, code);

  // 5. Respond
  res.status(200).json({ success: true });
});

export default router;
