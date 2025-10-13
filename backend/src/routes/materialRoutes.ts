import { Router } from "express";
import multer from "multer";
import multerS3 from "multer-s3-v3";
import { S3Client } from "@aws-sdk/client-s3";
import { authMiddleware, isTeacher } from "../middleware/authMiddleware";
import * as materialController from "../controllers/materialController";

const router = Router();

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
      cb(null, `materials/${Date.now().toString()}-${file.originalname}`);
    },
  }),
});

// Class materials
router.post(
  "/classes/:classId/materials",
  authMiddleware,
  isTeacher,
  upload.single("file"),
  materialController.createClassMaterial
);

router.get(
  "/classes/:classId/materials",
  authMiddleware,
  materialController.listClassMaterials
);

router.delete(
  "/classes/:classId/materials/:materialId",
  authMiddleware,
  isTeacher,
  materialController.deleteClassMaterial
);

// Assignment resources
router.post(
  "/assignments/:assignmentId/resources",
  authMiddleware,
  isTeacher,
  upload.single("file"),
  materialController.createAssignmentResource
);

router.get(
  "/assignments/:assignmentId/resources",
  authMiddleware,
  materialController.listAssignmentResources
);

router.delete(
  "/assignments/:assignmentId/resources/:resourceId",
  authMiddleware,
  isTeacher,
  materialController.deleteAssignmentResource
);

export default router;
