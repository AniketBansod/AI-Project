// src/queues/plagiarismQueue.ts
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
// Support TLS if rediss:// is used
const isTls = redisUrl.startsWith('rediss://');
const connection = new IORedis(redisUrl, {
	maxRetriesPerRequest: null,
	tls: isTls ? {} : undefined,
});

export const plagiarismQueue = new Queue('plagiarism-checks', {
	connection,
	defaultJobOptions: {
		attempts: Number(process.env.JOB_ATTEMPTS || 3),
		backoff: {
			type: 'exponential',
			delay: Number(process.env.JOB_BACKOFF_MS || 3000),
		},
		removeOnComplete: { age: 3600, count: 1000 },
		removeOnFail: { age: 86400 },
	},
});

export default plagiarismQueue;
