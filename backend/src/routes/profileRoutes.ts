import { Router } from "express";
import multer from "multer";
import multerS3 from "multer-s3-v3";
import { S3Client } from "@aws-sdk/client-s3";
import { authMiddleware } from "../middleware/authMiddleware";
import * as profileController from "../controllers/profileController";

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
      cb(null, `avatar-${Date.now().toString()}-${file.originalname}`);
    },
  }),
});

router.get("/me", authMiddleware, profileController.getProfile);
router.put("/me", authMiddleware, profileController.updateProfile);
router.post("/avatar", authMiddleware, upload.single("avatar"), profileController.updateAvatar);
router.post("/password/request", authMiddleware, profileController.requestPasswordChange);
router.post("/password/verify", authMiddleware, profileController.verifyPasswordChange);

export default router;
