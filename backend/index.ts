import 'dotenv/config';
import express from "express";
import cors from "cors";
import helmet from 'helmet';
import authRoutes from "./src/routes/authRoutes";
import { authMiddleware } from "./src/middleware/authMiddleware";
import passport from "passport";
import "./src/utils/passport"; 
import classRoutes from "./src/routes/classRoutes"; 
import assignmentRoutes from "./src/routes/assignmentRoutes";
import submissionRoutes from "./src/routes/submissionRoutes"; // 1. Import
import postRoutes from "./src/routes/postRoutes"; // 1. Import post routes
import commentRoutes from "./src/routes/commentRoutes"; 
import submissionCommentRoutes from "./src/routes/submissionCommentRoutes"; // 1. Import
import plagiarismReportRoutes from "./src/routes/plagiarismReportRoutes";
import profileRoutes from "./src/routes/profileRoutes";

import prisma from './src/utils/prisma';

const app = express();

const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';
const JSON_LIMIT = process.env.JSON_LIMIT || '1mb';

app.use(helmet());
app.use(cors({ origin: ALLOWED_ORIGIN, credentials: true }));
app.use(express.json({ limit: JSON_LIMIT }));
app.use(passport.initialize());

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});
// Readiness endpoint (checks DB)
app.get('/ready', async (_req, res) => {
  try {
    // lightweight query to ensure DB connection works
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ready: true });
  } catch (e) {
    res.status(503).json({ ready: false, error: 'db-unavailable' });
  }
});
// Example protected route
app.get("/protected", authMiddleware, (req, res) => {
  res.json({ message: "You are authenticated", user: (req as any).user });
});

app.use("/auth", authRoutes);
app.use("/api/classes", classRoutes); // 2. Add this line
app.use("/api/assignments", assignmentRoutes); 
app.use("/api/submissions", submissionRoutes);
app.use("/api/submission-comments", submissionCommentRoutes); 
app.use("/api/plagiarism-reports", plagiarismReportRoutes);
app.use("/api/profile", profileRoutes);

// app.use("/api/assignments", assignmentRoutes);
// app.use("/api/submissions", submissionRoutes); // 2. Add this line
app.use("/api/posts", postRoutes); // 2. Add this line
app.use("/api/comments", commentRoutes); // 2. Add this line
//...

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Centralized error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const status = err?.status || 500;
  const message = err?.message || 'Internal Server Error';
  res.status(status).json({ error: message });
});

const PORT = Number(process.env.PORT) || 5000;
const server = app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

// Graceful shutdown
const shutdown = async (signal: string) => {
  try {
    console.log(`\n${signal} received: closing HTTP server...`);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
    console.log('Shutdown complete.');
    process.exit(0);
  } catch (e) {
    console.error('Error during shutdown', e);
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
