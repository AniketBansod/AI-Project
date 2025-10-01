import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  throw new Error('REDIS_URL environment variable is not set');
}

// Create a new Redis connection instance from the URL.
// This is the most robust way to connect, especially for cloud providers like Upstash.
const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null
});

export const plagiarismQueue = new Queue('plagiarism-checks', { 
    connection: connection
});