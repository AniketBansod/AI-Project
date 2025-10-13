import { Router } from "express";
import * as submissionCommentController from "../controllers/submissionCommentController";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();

// GET /api/submission-comments/:submissionId - Get all comments for a submission
router.get(
  "/:submissionId",
  authMiddleware,
  submissionCommentController.getCommentsForSubmission
);

// POST /api/submission-comments/:submissionId - Add a comment to a submission
router.post(
  "/:submissionId",
  authMiddleware,
  submissionCommentController.createCommentOnSubmission
);

export default router;