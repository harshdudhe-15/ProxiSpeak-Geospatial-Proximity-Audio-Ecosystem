import mongoose from 'mongoose';

let memoryServerInstance = null;
let connectionEstablishedAt = null;

/**
 * Safely masks MongoDB connection URI for diagnostic logging without leaking credentials.
 */
export function maskMongoUri(uri) {
  if (!uri || typeof uri !== 'string') return '';
  return uri.replace(/(mongodb(?:\+srv)?:\/\/)([^:@]+):([^@]+)@/i, '$1***:***@');
}

/**
 * Returns current database connection and health status.
 */
export function getDatabaseStatus() {
  const readyState = mongoose.connection.readyState;
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return {
    connected: readyState === 1,
    state: states[readyState] || 'unknown',
    readyState,
    host: mongoose.connection.host || null,
    isMemory: Boolean(memoryServerInstance),
    uptimeSeconds: connectionEstablishedAt ? Math.floor((Date.now() - connectionEstablishedAt) / 1000) : 0
  };
}

/**
 * Connects to MongoDB Atlas or local database with persistent pooling,
 * proper timeouts, retry logic, and zero credential leakage.
 */
export async function connectDB() {
  // If already connected, reuse the singleton connection
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  // Support preferred MONGODB_URI while gracefully accepting MONGODB_URL if misconfigured in dashboard
  const rawUri = (process.env.MONGODB_URI || process.env.MONGODB_URL || '').trim();

  const isExplicitMongoUri = Boolean(rawUri);
  const isProduction = process.env.NODE_ENV === 'production';
  const forceMemory = process.env.USE_MEMORY_DB === 'true';

  // Determine safe URI prefix for diagnostic logging without credential leakage
  const safePrefix = rawUri
    ? (rawUri.startsWith('mongodb+srv://') ? 'mongodb+srv://' : rawUri.startsWith('mongodb://') ? 'mongodb://' : 'configured')
    : 'MISSING';

  console.log('[Database] MONGODB_URI exists:', isExplicitMongoUri);
  console.log('[Database] MONGODB_URI prefix:', safePrefix);

  if (!process.env.MONGODB_URI && process.env.MONGODB_URL) {
    console.warn('[Database] Notice: Using MONGODB_URL fallback. Preferred production variable is MONGODB_URI.');
  }

  // STEP 4: Production must fail immediately with a clear error if MONGODB_URI is missing
  if (isProduction && !rawUri) {
    console.error('[Database] Fatal Configuration Error: MONGODB_URI is not configured for production.');
    throw new Error('MONGODB_URI is not configured for production.');
  }

  // Production must never use the in-memory database
  if (isProduction && forceMemory) {
    console.error('[Database] Fatal Configuration Error: USE_MEMORY_DB=true is not permitted in production. A persistent MongoDB Atlas cluster is required.');
    throw new Error('USE_MEMORY_DB cannot be true in production.');
  }

  const uri = rawUri || 'mongodb://127.0.0.1:27017/proxispeak';
  const maskedUri = maskMongoUri(uri);

  const mongooseOptions = {
    serverSelectionTimeoutMS: 10000, // 10s for DNS SRV lookup & TLS handshake to Atlas
    connectTimeoutMS: 10000,
    maxPoolSize: 10,
    minPoolSize: 2,                  // Keeps warm sockets open in pool
    socketTimeoutMS: 45000,
    family: 4                        // Prefer IPv4 to prevent cloud IPv6 resolution hangs
  };

  if (!forceMemory) {
    try {
      console.log(`[Database] Attempting connection to MongoDB at: ${maskedUri}`);
      const conn = await mongoose.connect(uri, mongooseOptions);
      connectionEstablishedAt = Date.now();
      console.log(`[Database] Successfully connected to MongoDB: ${conn.connection.host}`);
      return conn;
    } catch (err) {
      console.warn(`[Database] Initial MongoDB connection attempt failed: ${err.message}`);

      // If in production or an explicit MongoDB URI (like MongoDB Atlas) was provided,
      // retry once before failing. NEVER fall back to downloading mongodb-memory-server in production!
      if (isExplicitMongoUri || isProduction) {
        console.log(`[Database] Retrying MongoDB connection in 2000ms...`);
        await new Promise(res => setTimeout(res, 2000));
        try {
          const retryConn = await mongoose.connect(uri, mongooseOptions);
          connectionEstablishedAt = Date.now();
          console.log(`[Database] Successfully connected to MongoDB on retry: ${retryConn.connection.host}`);
          return retryConn;
        } catch (retryErr) {
          console.error(`[Database] Fatal error: Could not connect to configured MongoDB (${maskedUri}): ${retryErr.message}`);
          throw retryErr;
        }
      }

      console.log(`[Database] Falling back to high-performance in-memory MongoDB engine for local development...`);
    }
  }

  // Fallback or explicit in-memory MongoDB (local development/tests only)
  try {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    if (!memoryServerInstance) {
      memoryServerInstance = await MongoMemoryServer.create();
    }
    const memUri = memoryServerInstance.getUri();
    console.log(`[Database] Starting In-Memory MongoDB Server at: ${memUri}`);
    const conn = await mongoose.connect(memUri, {
      maxPoolSize: 10,
      minPoolSize: 2
    });
    connectionEstablishedAt = Date.now();
    console.log(`[Database] Connected to In-Memory MongoDB instance successfully.`);
    return conn;
  } catch (memErr) {
    console.error(`[Database] Failed to start In-Memory MongoDB: ${memErr.message}`);
    throw memErr;
  }
}

export async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (memoryServerInstance) {
    await memoryServerInstance.stop();
    memoryServerInstance = null;
  }
  connectionEstablishedAt = null;
}
