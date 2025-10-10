import { Router } from "express";
import { authMiddleware, isTeacher } from "../middleware/authMiddleware";
import * as controller from "../controllers/plagiarismReportController";

const router = Router();

// GET /api/plagiarism-reports/:submissionId
router.get(
  "/:submissionId",
  authMiddleware,
  isTeacher,
  controller.getReportBySubmissionId
);

export default router;
