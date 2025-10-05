import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRoutes from "./src/routes/authRoutes";
import { authMiddleware } from "./src/middleware/authMiddleware";
import passport from "passport";
import "./src/utils/passport"; 
import classRoutes from "./src/routes/classRoutes"; 
import assignmentRoutes from "./src/routes/assignmentRoutes";
import submissionRoutes from "./src/routes/submissionRoutes";
import postRoutes from "./src/routes/postRoutes";
import commentRoutes from "./src/routes/commentRoutes"; 
import submissionCommentRoutes from "./src/routes/submissionCommentRoutes";

const app = express();

app.use(cors({ origin: "http://localhost:3000", credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
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

app.use("/api/assignments", assignmentRoutes);
app.use("/api/submissions", submissionRoutes); // 2. Add this line
app.use("/api/posts", postRoutes); // 2. Add this line
app.use("/api/comments", commentRoutes); // 2. Add this line
//...

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
