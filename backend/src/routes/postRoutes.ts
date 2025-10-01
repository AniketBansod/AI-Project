// src/routes/postRoutes.ts
import { Router } from "express";
import * as postController from "../controllers/postController";
import { authMiddleware, isTeacher } from "../middleware/authMiddleware";

const router = Router();

// POST /api/posts/:classId - Create a new post in a class
router.post(
  "/:classId",
  authMiddleware,
  isTeacher,
  postController.createPost
);

export default router;