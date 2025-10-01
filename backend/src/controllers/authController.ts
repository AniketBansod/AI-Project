import { Request, Response } from "express";
import prisma from "../utils/prisma";
import { hashPassword, comparePassword, generateToken } from "../utils/auth";
import { sendEmail } from "../utils/email"; // Import the email utility
import crypto from "crypto";
import {
  generateVerificationEmailHtml // Import the new function
} from "../utils/email"; 


export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(400).json({ error: "Email already exists" });

   const verificationToken = crypto.randomBytes(32).toString("hex");
    const hashedPassword = await hashPassword(password);

    // Update the user creation to include the token
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        verificationToken,
      },
    });

    // Send the verification email
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

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) return res.status(401).json({ error: "Invalid credentials" });

    if (user.provider === 'google') {
      return res.status(403).json({ 
        error: "You have previously signed in with Google. Please use the 'Sign in with Google' button." 
      });
    }
// Add this block
    if (!user.emailVerified) {
         return res.status(403).json({ error: "Please verify your email before logging in." });
      }
    const valid = await comparePassword(password, user.password);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    const token = generateToken(user.id, user.role);

    res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  } finally {
    await prisma.$disconnect();
  }
};

// Add this new function in authController.ts
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

// ... other functions

export const googleCallback = (req: Request, res: Response) => {
  // Passport attaches the user to req.user after successful authentication
  const user = req.user as any;
  if (!user) {
    return res.redirect("http://localhost:3000/login?error=AuthenticationFailed");
  }

  // Generate a JWT for our application
  const token = generateToken(user.id, user.role);

  // Redirect to a frontend page with the token
  res.redirect(`http://localhost:3000/auth/callback?token=${token}`);
};

// Add this to src/controllers/authController.ts

export const getMe = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      // Select only the fields that are safe to send to the client
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