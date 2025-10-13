import { Router } from "express";
import passport from "passport";
import * as authController from "../controllers/authController";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();

router.post("/register", authController.register);
router.post("/login", authController.login);

// Add this new line
router.get("/verify-email/:token", authController.verifyEmail);

// Google OAuth Initiation
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"], session: false })
);

// Google OAuth Callback
router.get(
  "/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: "/login" }),
  authController.googleCallback
);

// Add this to src/routes/authRoutes.ts
// It can go anywhere before the `export default router;`
router.get("/me", authMiddleware, authController.getMe);

// Forgot password via OTP
router.post("/password/forgot", authController.forgotPasswordRequest);
router.post("/password/reset-verify", authController.resetPasswordVerify);

export default router;
