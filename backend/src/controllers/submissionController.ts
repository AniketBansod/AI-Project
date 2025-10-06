import { Request, Response } from "express";
import prisma from "../utils/prisma";
import plagiarismQueue from "../queues/plagiarismQueue";
import axios from "axios";
import { S3Client, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";
import dotenv from "dotenv";
dotenv.config();

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";
const S3_BUCKET = process.env.AWS_S3_BUCKET_NAME;
const s3 = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });

/**
 * Create submission (student).
 * Expects: content? (text), file? (upload), assignmentId (from params)
 * - writes Submission
 * - writes initial PlagiarismReport (PENDING)
 * - enqueues background job
 */
export const createSubmission = async (req: Request, res: Response) => {
  try {
    // cast req.user so TS accepts it
    const user = req.user as { id: string; role?: string } | undefined;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    // ✅ assignmentId now comes from params
    const { assignmentId } = req.params;
    if (!assignmentId) {
      return res.status(400).json({ error: "assignmentId required" });
    }

    // Get text content + file URL from S3 (if uploaded)
    const { content } = req.body;
    const fileUrl = req.file ? (req.file as any).location : null;

    // Save submission
    const submission = await prisma.submission.create({
      data: {
        content: content || null,
        fileUrl: fileUrl || null,
        studentId: user.id,
        assignmentId,
      },
    });

    // Create initial plagiarism report (PENDING)
    try {
      await prisma.plagiarismReport.create({
        data: {
          submissionId: submission.id,
          similarity: 0.0,
          aiProbability: 0.0,
          highlights: [],
          status: "PENDING",
        },
      });
    } catch (err) {
      console.warn(
        "Warning: could not create initial PlagiarismReport (might exist):",
        err
      );
    }

    // Enqueue background job
    try {
      await plagiarismQueue.add(
        "processSubmission",
        {
          submissionId: submission.id,
          assignmentId,
          fileUrl: submission.fileUrl,
        },
        {
          attempts: 3,
          backoff: { type: "exponential", delay: 60_000 },
        }
      );
    } catch (err) {
      console.error("Failed to enqueue plagiarism job:", err);
    }

    return res.status(201).json(submission);
  } catch (err) {
    console.error("createSubmission error", err);
    return res.status(500).json({ error: "Failed to create submission" });
  }
};

/**
 * Download highlighted PDF
 * Route: GET /api/submissions/:submissionId/highlighted-pdf
 */
export const downloadHighlightedPdf = async (req: Request, res: Response) => {
  try {
    const { submissionId } = req.params;
    const user = req.user as { id: string; role?: string } | undefined;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    // fetch submission and teacherId for authorization
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        fileUrl: true,
        assignmentId: true,
        assignment: {
          select: { class: { select: { teacherId: true } } },
        },
      },
    });

    if (!submission) return res.status(404).json({ error: "Submission not found" });

    const teacherId = submission.assignment?.class?.teacherId;
    if (!teacherId || teacherId !== user.id) {
      return res
        .status(403)
        .json({ error: "Not authorized to download this file." });
    }

    // check S3 for cached highlight
    if (S3_BUCKET) {
      const key = `highlighted/${submissionId}.pdf`;
      try {
        await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
        const getRes = await s3.send(
          new GetObjectCommand({ Bucket: S3_BUCKET, Key: key })
        );

        const body = getRes.Body as Readable | null;
        if (!body) return res.status(500).json({ error: "S3 object has no body" });

        body.pipe(res);
        return;
      } catch (err) {
        console.log("Highlighted PDF not found in S3 — falling back to AI service");
      }
    }

    // fallback: proxy AI service
    try {
      const aiResp = await axios.post(
        `${AI_SERVICE_URL}/highlight_pdf`,
        { file_url: submission.fileUrl, submission_id: submission.id },
        { responseType: "stream", timeout: 10 * 60 * 1000 }
      );

      const ct = aiResp.headers["content-type"] || "application/pdf";
      const cd =
        aiResp.headers["content-disposition"] ||
        `attachment; filename=submission_${submissionId}_highlighted.pdf`;

      res.setHeader("Content-Type", ct);
      res.setHeader("Content-Disposition", cd);

      const stream = aiResp.data as Readable;
      stream.pipe(res);
    } catch (err) {
      console.error("Error proxying AI highlight_pdf:", err);
      return res.status(500).json({ error: "Failed to generate highlighted PDF" });
    }
  } catch (err) {
    console.error("downloadHighlightedPdf error", err);
    return res.status(500).json({ error: "Failed to download highlighted PDF" });
  }
};
// Add this function to backend/src/controllers/submissionController.ts
export const gradeSubmission = async (req: Request, res: Response) => {
  try {
    const { submissionId } = req.params;
    const { grade, feedback } = req.body;
    const teacherId = (req as any).user.id;

    // Security check: Ensure the teacher owns the class this submission belongs to
    const submission = await prisma.submission.findFirst({
      where: {
        id: submissionId,
        assignment: {
          class: {
            teacherId: teacherId,
          },
        },
      },
    });

    if (!submission) {
      return res.status(403).json({ error: "You are not authorized to grade this submission." });
    }

    const updatedSubmission = await prisma.submission.update({
      where: { id: submissionId },
      data: {
        grade: grade,
        feedback: feedback,
      },
    });

    res.status(200).json(updatedSubmission);
  } catch (err) {
    console.error("Grading error", err);
    return res.status(500).json({ error: "Failed to grade submission." });
  }
};