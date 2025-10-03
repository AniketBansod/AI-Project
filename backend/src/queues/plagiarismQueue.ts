// src/queues/plagiarismQueue.ts
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

export const plagiarismQueue = new Queue('plagiarism-checks', { connection });

export default plagiarismQueue;
