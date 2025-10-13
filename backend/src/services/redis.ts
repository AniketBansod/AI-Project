import Redis from "ioredis";

// Create a singleton Redis client. Supports REDIS_URL or discrete env vars.
const redis = (() => {
	const url = process.env.REDIS_URL;
	if (url) return new Redis(url);
	const host = process.env.REDIS_HOST || "127.0.0.1";
	const port = Number(process.env.REDIS_PORT || 6379);
	const password = process.env.REDIS_PASSWORD || undefined;
	return new Redis({ host, port, password });
})();

export async function getJSON<T = any>(key: string): Promise<T | null> {
	try {
		const raw = await redis.get(key);
		if (!raw) return null;
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

export async function setJSON(key: string, value: any, ttlSeconds?: number): Promise<void> {
	try {
		const str = JSON.stringify(value);
		if (ttlSeconds && ttlSeconds > 0) {
			await redis.set(key, str, "EX", ttlSeconds);
		} else {
			await redis.set(key, str);
		}
	} catch {
		// ignore cache errors
	}
}

export async function delKey(key: string): Promise<void> {
	try {
		await redis.del(key);
	} catch {
		// ignore cache errors
	}
}

export default redis;

