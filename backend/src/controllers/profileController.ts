import { Request, Response } from "express";
import prisma from "../utils/prisma";
import { hashPassword, comparePassword } from "../utils/auth";
import { sendEmail } from "../utils/email";
import crypto from "crypto";

export const getProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, image: true }
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: "Failed to load profile" });
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { name } = req.body as { name?: string };
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ error: "Name must be at least 2 characters" });
    }
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { name: name.trim() },
      select: { id: true, name: true, email: true, role: true, image: true }
    });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: "Failed to update profile" });
  }
};

export const updateAvatar = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const file = (req as any).file;
    if (!file || !file.location) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { image: file.location },
      select: { id: true, name: true, email: true, role: true, image: true }
    });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: "Failed to upload avatar" });
  }
};

// Start change password flow: verify current password, then email OTP
// simple in-memory expiry tracker keyed by user id; in production, prefer Redis
const otpExpiry: Record<string, number> = {};

export const requestPasswordChange = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { currentPassword } = req.body as { currentPassword: string };
    if (!currentPassword) return res.status(400).json({ error: "Current password is required" });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, password: true } });
    if (!user || !user.password) return res.status(400).json({ error: "Invalid account" });
    const ok = await comparePassword(currentPassword, user.password);
    if (!ok) return res.status(401).json({ error: "Current password is incorrect" });

    // generate numeric OTP (6 digits)
    const otp = (Math.floor(100000 + Math.random() * 900000)).toString();
    const token = crypto.createHash("sha256").update(otp).digest("hex");
    // Reuse verificationToken column to store OTP token
    await prisma.user.update({ where: { id: userId }, data: { verificationToken: token } });
    otpExpiry[userId] = Date.now() + 10 * 60 * 1000; // 10 minutes

    await sendEmail({
      to: user.email,
      subject: "Your AI Classroom password change OTP",
      html: `<p>Use this OTP to change your password: <strong>${otp}</strong></p><p>It expires in 10 minutes.</p>`
    });

    res.json({ message: "OTP sent to your email" });
  } catch (e) {
    res.status(500).json({ error: "Failed to start password change" });
  }
};

export const verifyPasswordChange = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { otp, newPassword } = req.body as { otp: string; newPassword: string };
    if (!otp || !newPassword) return res.status(400).json({ error: "OTP and new password are required" });

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, verificationToken: true } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const token = crypto.createHash("sha256").update(otp).digest("hex");
    if (!user.verificationToken || user.verificationToken !== token) {
      return res.status(400).json({ error: "Invalid OTP" });
    }
    if (!otpExpiry[userId] || otpExpiry[userId] < Date.now()) {
      return res.status(400).json({ error: "OTP expired" });
    }

    const hashed = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: userId }, data: { password: hashed, verificationToken: null } });
    delete otpExpiry[userId];

    res.json({ message: "Password changed successfully" });
  } catch (e) {
    res.status(500).json({ error: "Failed to change password" });
  }
};
