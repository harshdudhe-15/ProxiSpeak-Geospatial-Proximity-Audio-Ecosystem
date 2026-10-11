import express from 'express';
import cors from 'cors';
import officeRoutes from './routes/officeRoutes.js';
import userRoutes from './routes/userRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  // CORS configuration
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));

  app.use(express.json());

  // Health and Diagnostic check
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      service: 'ProxiSpeak API & Signaling Engine',
      timestamp: new Date().toISOString()
    });
  });

  // REST API Routes
  app.use('/api/offices', officeRoutes);
  app.use('/api/users', userRoutes);

  // Error handling middleware
  app.use(errorHandler);

  return app;
}
