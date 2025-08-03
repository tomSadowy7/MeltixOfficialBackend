import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import homebaseRoutes from './routes/homebase.js';
import authRoutes from './routes/auth.js';
import deviceRoutes from './routes/device.js';
import sprinklerRoutes from './routes/sprinkler.js';
import scheduleRoutes from './routes/schedule.js';
import accountRoutes from './routes/account.js';
import bugReportRouter from "./routes/bugreport.js";
import './jobs/schedulerWorker.js';
import './jobs/pingWorker.js'; // Ensure pingWorker is imported to start the cron job

// --- Import both WS servers ---
import { createPiWebSocketServer } from './websockets/ws-pi.js';
import { createAppWebSocketServer } from './websockets/ws-app.js';

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;
console.log(new Date().toString())
// Middleware
app.use(cors());
app.use(express.json());

// API routes
app.use('/homebase', homebaseRoutes);
app.use('/auth', authRoutes);
app.use('/device', deviceRoutes);
app.use('/sprinkler', sprinklerRoutes); // Assuming sprinkler routes are in device.js
app.use('/schedule', scheduleRoutes);
app.use('/account', accountRoutes);
app.use("/bugreport", bugReportRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Start WebSocket servers on separate ports
createPiWebSocketServer(8081);   // Pi <-> Backend
createAppWebSocketServer(8082);  // App <-> Backend
