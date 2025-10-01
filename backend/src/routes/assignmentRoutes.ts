// src/routes/assignmentRoutes.ts
import { Router } from "express";
import * as assignmentController from "../controllers/assignmentController";
import { authMiddleware, isTeacher, isStudent } from "../middleware/authMiddleware";

const router = Router();

// POST /api/assignments/:classId
router.post(
  "/:classId",
  authMiddleware,
  isTeacher,
  assignmentController.createAssignment
);

// src/routes/assignmentRoutes.ts

// GET /api/assignments/:assignmentId - Get a single assignment
router.get(
    "/:assignmentId",
    authMiddleware,
    isStudent,
    assignmentController.getAssignmentById
);


// src/routes/assignmentRoutes.ts

// GET /api/assignments/:assignmentId/submissions - Get all submissions for an assignment
router.get(
  "/:assignmentId/submissions",
  authMiddleware,
  isTeacher,
  assignmentController.getSubmissionsForAssignment
);

// ... (existing POST route)
export default router;