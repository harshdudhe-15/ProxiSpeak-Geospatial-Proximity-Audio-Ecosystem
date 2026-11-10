import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDB, maskMongoUri } from '../src/config/db.js';

describe('Production Database Configuration Validation', () => {
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    // Ensure disconnected state for testing connectDB validations
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('Security: maskMongoUri safely masks credentials', () => {
    const rawAtlas = 'mongodb+srv://admin_user:SuperSecretPassword123@cluster0.mongodb.net/proxispeak?retryWrites=true';
    const masked = maskMongoUri(rawAtlas);
    assert.equal(masked, 'mongodb+srv://***:***@cluster0.mongodb.net/proxispeak?retryWrites=true');
    assert(!masked.includes('admin_user'));
    assert(!masked.includes('SuperSecretPassword123'));
  });

  test('Production: throws immediately if MONGODB_URI is missing', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.MONGODB_URI;
    delete process.env.MONGODB_URL;

    await assert.rejects(
      async () => {
        await connectDB();
      },
      {
        name: 'Error',
        message: 'MONGODB_URI is not configured for production.'
      }
    );
  });

  test('Production: throws immediately if USE_MEMORY_DB=true is specified', async () => {
    process.env.NODE_ENV = 'production';
    process.env.USE_MEMORY_DB = 'true';
    process.env.MONGODB_URI = 'mongodb+srv://user:pass@cluster0.mongodb.net/proxispeak';

    await assert.rejects(
      async () => {
        await connectDB();
      },
      {
        name: 'Error',
        message: 'USE_MEMORY_DB cannot be true in production.'
      }
    );
  });
});

