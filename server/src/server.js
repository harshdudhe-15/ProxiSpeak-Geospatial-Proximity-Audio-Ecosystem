import http from 'http';
import dotenv from 'dotenv';
import { Server as SocketIOServer } from 'socket.io';
import { createApp } from './app.js';
import { connectDB } from './config/db.js';
import { initializeSocketManager } from './sockets/socketManager.js';

dotenv.config();

const PORT = process.env.PORT || 5000;
const app = createApp();
const httpServer = http.createServer(app);

// Initialize Socket.IO with CORS
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 20000,
  pingInterval: 10000
});

// Attach socket manager
initializeSocketManager(io);

async function startServer() {
  try {
    await connectDB();

    httpServer.listen(PORT, () => {
      console.log(`===============================================`);
      console.log(`🎙️  ProxiSpeak Real-Time Server Running!`);
      console.log(`📡 Port: ${PORT}`);
      console.log(`🚀 Mode: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
      console.log(`===============================================`);
    });
  } catch (err) {
    console.error('Fatal error starting server:', err);
    process.exit(1);
  }
}

startServer();

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received. Closing HTTP server...');
  httpServer.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
});
