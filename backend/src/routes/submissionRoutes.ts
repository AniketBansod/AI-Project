// src/routes/submissionRoutes.ts
import { Router } from "express";
import multer from "multer";
import multerS3 from "multer-s3-v3";
import { S3Client } from "@aws-sdk/client-s3";
import * as submissionController from "../controllers/submissionController";
import { authMiddleware, isStudent, isTeacher } from "../middleware/authMiddleware";

const router = Router();

// Configure S3 Client (v3) - ensure env variables exist
const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const upload = multer({
  storage: multerS3({
    s3,
    bucket: process.env.AWS_S3_BUCKET_NAME!,
    key: (req: Express.Request, file: Express.Multer.File, cb: (error: any, key?: string) => void) => {
      cb(null, `submission-${Date.now().toString()}-${file.originalname}`);
    },
  }),
});

// POST /api/submissions/:assignmentId (student uploads)
router.post(
  "/:assignmentId",
  authMiddleware,
  isStudent,
  upload.single("file"),
  submissionController.createSubmission
);

// GET /api/submissions/:submissionId/highlighted-pdf (teacher downloads highlighted PDF)
router.get(
  "/:submissionId/highlighted-pdf",
  authMiddleware,
  isTeacher,
  submissionController.downloadHighlightedPdf
);

export default router;
