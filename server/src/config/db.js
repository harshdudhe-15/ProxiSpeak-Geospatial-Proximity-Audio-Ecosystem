import mongoose from 'mongoose';

let memoryServerInstance = null;

export async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/proxispeak';
  const forceMemory = process.env.USE_MEMORY_DB === 'true';

  if (!forceMemory) {
    try {
      console.log(`[Database] Attempting connection to MongoDB at: ${uri}`);
      const conn = await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 2500, // Quick timeout to fallback if no local mongod
      });
      console.log(`[Database] Successfully connected to MongoDB: ${conn.connection.host}`);
      return conn;
    } catch (err) {
      console.warn(`[Database] Could not connect to external MongoDB: ${err.message}`);
      console.log(`[Database] Falling back to high-performance in-memory MongoDB engine...`);
    }
  }

  // Fallback or explicit in-memory MongoDB
  try {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memoryServerInstance = await MongoMemoryServer.create();
    const memUri = memoryServerInstance.getUri();
    console.log(`[Database] Starting In-Memory MongoDB Server at: ${memUri}`);
    const conn = await mongoose.connect(memUri);
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
}
