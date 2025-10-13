import 'dotenv/config';
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
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
import materialRoutes from "./src/routes/materialRoutes";

import prisma from './src/utils/prisma';
import { CORS_ALLOWED } from "./src/utils/config";

const app = express();

app.set("trust proxy", 1);
app.use(helmet());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

app.use(
  cors({
    origin: CORS_ALLOWED.length ? CORS_ALLOWED : true,
    credentials: true,
  })
);

// Health endpoint for Compose/Caddy checks
app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

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
app.use("/api", materialRoutes);

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

const PORT = Number(process.env.PORT || 5000);
const server = app.listen(PORT, () => {
  console.log(`API listening on :${PORT}`);
});

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`Received ${signal}, shutting down...`);
  server.close(async () => {
    try {
      await prisma.$disconnect();
    } catch (e) {
      console.error("Prisma disconnect error", e);
    }
    process.exit(0);
  });
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
