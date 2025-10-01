// src/routes/commentRoutes.ts
import { Router } from "express";
import * as commentController from "../controllers/commentController";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();

// POST /api/comments/:postId - Create a new comment on a post
router.post(
  "/:postId",
  authMiddleware, // Any logged-in user can try to comment
  commentController.createComment
);

export default router;