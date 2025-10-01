// src/routes/submissionRoutes.ts
import { Router } from "express";
import multer from "multer";
import multerS3 from "multer-s3-v3";
import { S3Client } from "@aws-sdk/client-s3";
import * as submissionController from "../controllers/submissionController";
import { authMiddleware, isStudent } from "../middleware/authMiddleware";

// Configure S3 Client (v3)
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

const router = Router();

// POST /api/submissions/:assignmentId
router.post(
  "/:assignmentId",
  authMiddleware,
  isStudent,
  upload.single("file"),
  submissionController.createSubmission
);

export default router;
