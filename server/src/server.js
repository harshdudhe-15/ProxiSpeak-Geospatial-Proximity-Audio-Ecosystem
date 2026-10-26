import http from 'http';
import dotenv from 'dotenv';
import { Server as SocketIOServer } from 'socket.io';
import { createApp } from './app.js';
import { connectDB, disconnectDB } from './config/db.js';
import { initializeSocketManager } from './sockets/socketManager.js';
import { prewarmHeadquartersOffice } from './services/officeService.js';
import { proximityEngine } from './services/proximityEngine.js';
import { Office } from './models/Office.js';
import { User } from './models/User.js';
import { PositionSnapshot } from './models/PositionSnapshot.js';

dotenv.config();

const PORT = process.env.PORT || 5000;
const app = createApp();
const httpServer = http.createServer(app);
const allowedOrigin = process.env.CLIENT_ORIGIN || '*';

// Initialize Socket.IO with CORS
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: allowedOrigin,
    methods: ['GET', 'POST']
  },
  pingTimeout: 20000,
  pingInterval: 10000
});

// Attach socket manager
initializeSocketManager(io);

async function startServer() {
  const startupStart = performance.now();
  console.log('[Startup] Initializing ProxiSpeak server and warming up services...');

  try {
    // 1. Establish persistent connection to MongoDB
    const dbStart = performance.now();
    await connectDB();
    const dbDuration = (performance.now() - dbStart).toFixed(2);
    console.log(`[Startup] Database connection verified in ${dbDuration}ms`);

    // 2. Prepare required indexes
    const indexStart = performance.now();
    await Promise.allSettled([
      Office.init(),
      User.init(),
      PositionSnapshot.init()
    ]);
    const indexDuration = (performance.now() - indexStart).toFixed(2);
    console.log(`[Startup] Database indexes prepared in ${indexDuration}ms`);

    // 3. Pre-warm canonical ProxiSpeak Headquarters into in-memory cache
    const hqStart = performance.now();
    const hq = await prewarmHeadquartersOffice();
    const hqId = String(hq._id || hq.code || 'hq-main');
    const obstacles = [
      ...(hq.walls || []),
      ...(hq.furniture || [])
    ];
    proximityEngine.setOfficeObstacles(hqId, obstacles);
    const hqDuration = (performance.now() - hqStart).toFixed(2);
    console.log(`[Startup] Canonical Headquarters pre-warmed in ${hqDuration}ms (ID: ${hqId})`);

    // 4. Start accepting application traffic
    httpServer.listen(PORT, '0.0.0.0', () => {
      const totalStartup = (performance.now() - startupStart).toFixed(2);
      console.log(`===============================================`);
      console.log(`🎙️  ProxiSpeak Real-Time Server Running!`);
      console.log(`📡 Port: ${PORT}`);
      console.log(`🚀 Mode: ${process.env.NODE_ENV || 'development'}`);
      console.log(`⚡ Startup & Pre-warm Time: ${totalStartup}ms`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
      console.log(`===============================================`);
    });
  } catch (err) {
    console.error('[Startup] Fatal error during server startup sequence:', err);
    process.exit(1);
  }
}

startServer();

// Handle graceful shutdown
const shutdown = async () => {
  console.log('Shutdown signal received. Closing HTTP server and database...');
  httpServer.close(async () => {
    console.log('HTTP server closed.');
    try {
      await disconnectDB();
      console.log('Database connection closed.');
    } catch (e) {
      console.error('Error during database disconnection:', e);
    }
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
