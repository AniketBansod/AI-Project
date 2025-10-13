import { PrismaClient } from "@prisma/client";

// Use a singleton Prisma client to avoid creating multiple connections in dev
// when using ts-node/nodemon. In production (single process) this is a no-op.
const globalForPrisma = globalThis as unknown as {
	prisma?: PrismaClient;
};

export const prisma =
	globalForPrisma.prisma ||
	new PrismaClient({
		// You can add log levels via env if needed, e.g., ['warn', 'error']
	});

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
