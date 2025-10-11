import { Request, Response } from "express";
import prisma from "../utils/prisma";
import { hashPassword, comparePassword, generateToken } from "../utils/auth";
import { sendEmail, generateVerificationEmailHtml } from "../utils/email"; 
import crypto from "crypto";

// ... imports

export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(400).json({ error: "Email already exists" });

    // --- MODIFIED LINE ---
    // Use base64url for a URL-safe token
    const verificationToken = crypto.randomBytes(32).toString("base64url"); 
    
    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        verificationToken,
      },
    });

    // The rest of the function remains the same...
    const verificationUrl = `http://localhost:3000/verify-email/${verificationToken}`;
    const emailHtml = generateVerificationEmailHtml(user.name, verificationUrl);

    await sendEmail({
      to: user.email,
      subject: "Email Verification - AI Classroom",
      html: emailHtml,
    });

    res.json({ message: "Registration successful. Please check your email to verify your account." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Registration failed" });
  } finally {
    await prisma.$disconnect();
  }
};

// ... rest of the authController file



export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // --- ENHANCED UNIFIED LOGIC ---

    // Case 1: User does not exist at all
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Case 2: User exists, signed up with Google, and has NO password set yet.
    // This is the key scenario we want to handle gracefully.
    if (user.provider === 'google' && !user.password) {
      // Tell the frontend that a special action is needed.
      return res.status(403).json({ 
        error: "This account was created using Google. Please use the 'Sign in with Google' button, or set a password to sign in with email.",
        actionRequired: "SET_PASSWORD_FOR_GOOGLE_ACCOUNT" 
      });
    }
    
    // Case 3: User exists and has a password.
    if (!user.password) {
        return res.status(401).json({ error: "Invalid credentials" });
    }

    // Case 4: Check if the user's email is verified.
    if (!user.emailVerified) {
         return res.status(403).json({ error: "Please verify your email before logging in." });
    }

    // Case 5: Compare the provided password.
    const valid = await comparePassword(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Success: Generate token and log the user in.
    const token = generateToken(user.id, user.role);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  } finally {
    await prisma.$disconnect();
  }
};

export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const user = await prisma.user.findUnique({
      where: { verificationToken: token },
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid verification token" });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: new Date(),
        verificationToken: null, // Clear the token
      },
    });

    res.json({ message: "Email verified successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Email verification failed" });
  }
};

export const googleCallback = (req: Request, res: Response) => {
  const user = req.user as any;
  if (!user) {
    return res.redirect("http://localhost:3000/login?error=AuthenticationFailed");
  }

  const token = generateToken(user.id, user.role);

  res.redirect(`http://localhost:3000/auth/callback?token=${token}`);
};

export const getMe = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user profile" });
  }
};

// ===== Forgot password (OTP via email) =====
const forgotOtpStore: Record<string, { tokenHash: string; expires: number }> = {};

export const forgotPasswordRequest = async (req: Request, res: Response) => {
  try {
    const { email } = req.body as { email?: string };
    if (!email) return res.status(400).json({ error: "Email is required" });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Don't reveal if email exists
      return res.json({ message: "If an account exists for this email, an OTP has been sent." });
    }

    const otp = (Math.floor(100000 + Math.random() * 900000)).toString();
    const tokenHash = crypto.createHash("sha256").update(otp).digest("hex");
    forgotOtpStore[email] = { tokenHash, expires: Date.now() + 10 * 60 * 1000 };

    await sendEmail({
      to: email,
      subject: "Your AI Classroom password reset OTP",
      html: `<p>Use this OTP to reset your password: <strong>${otp}</strong></p><p>It expires in 10 minutes.</p>`
    });

    res.json({ message: "If an account exists for this email, an OTP has been sent." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to start password reset" });
  }
};

export const resetPasswordVerify = async (req: Request, res: Response) => {
  try {
    const { email, otp, newPassword } = req.body as { email?: string; otp?: string; newPassword?: string };
    if (!email || !otp || !newPassword) return res.status(400).json({ error: "Email, OTP and new password are required" });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(400).json({ error: "Invalid request" });

    const record = forgotOtpStore[email];
    if (!record) return res.status(400).json({ error: "Invalid or expired OTP" });
    if (record.expires < Date.now()) {
      delete forgotOtpStore[email];
      return res.status(400).json({ error: "OTP expired" });
    }
    const tokenHash = crypto.createHash("sha256").update(otp).digest("hex");
    if (tokenHash !== record.tokenHash) return res.status(400).json({ error: "Invalid OTP" });

    const hashed = await hashPassword(newPassword);
    await prisma.user.update({ where: { email }, data: { password: hashed } });
    delete forgotOtpStore[email];

    res.json({ message: "Password reset successfully" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to reset password" });
  }
};

