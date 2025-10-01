import { Router } from "express";
import * as classController from "../controllers/classController";
import { authMiddleware, isTeacher, isStudent, canAccessClass } from "../middleware/authMiddleware";

const router = Router();

// Teacher routes
router.post("/", authMiddleware, isTeacher, classController.createClass);
router.get("/", authMiddleware, isTeacher, classController.getClassesForTeacher);

// Student routes
router.post("/join", authMiddleware, isStudent, classController.joinClass);
router.get("/enrolled", authMiddleware, isStudent, classController.getEnrolledClasses);

// Dynamic route (classId) should always come last
router.get("/:classId", authMiddleware, canAccessClass, classController.getClassById);
router.delete(
  "/:classId/students/:studentId",
  authMiddleware,
  isTeacher,
  classController.removeStudentFromClass
);
export default router;
