// backend/src/controllers/submissionController.ts
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
    const user = req.user as { id: string; role?: string } | undefined;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { assignmentId } = req.params;
    if (!assignmentId) return res.status(400).json({ error: "assignmentId required" });

    const { content } = req.body;
    // file upload via multer-s3: req.file.location contains S3 URL
    const fileUrl = req.file ? (req.file as any).location : null;

    const submission = await prisma.submission.create({
      data: {
        content: content || null,
        fileUrl: fileUrl || null,
        studentId: user.id,
        assignmentId,
      },
    });

    // Create initial plagiarism report (PENDING) if not exists
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
      // If it already exists, ignore
      console.warn("Warning: could not create initial PlagiarismReport (might exist):", err);
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
      return res.status(403).json({ error: "Not authorized to download this file." });
    }

    // check S3 for cached highlight
    if (S3_BUCKET) {
      const key = `highlighted/${submissionId}.pdf`;
      try {
        await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
        const getRes = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));

        const body = getRes.Body as Readable | null;
        if (!body) return res.status(500).json({ error: "S3 object has no body" });

        // Pipe S3 stream to response
        (body as Readable).pipe(res);
        return;
      } catch (err) {
        console.log("Highlighted PDF not found in S3 — falling back to AI service");
      }
    }

    // fallback: proxy AI service (requests /highlight_pdf which returns pdf stream)
    try {
      const aiResp = await axios.post(
        `${AI_SERVICE_URL}/highlight_pdf`,
        { file_url: submission.fileUrl, submission_id: submission.id, assignment_id: submission.assignmentId },
        { responseType: "stream", timeout: 10 * 60 * 1000 }
      );

      const ct = aiResp.headers["content-type"] || "application/pdf";
      const cd = aiResp.headers["content-disposition"] || `attachment; filename=submission_${submissionId}_highlighted.pdf`;

      res.setHeader("Content-Type", ct);
      res.setHeader("Content-Disposition", cd);

      const stream = aiResp.data as Readable;
      stream.pipe(res);
    } catch (err) {
      console.error("Error proxying AI highlight_pdf:", (err as any)?.message || err);
      return res.status(500).json({ error: "Failed to generate highlighted PDF" });
    }
  } catch (err) {
    console.error("downloadHighlightedPdf error", err);
    return res.status(500).json({ error: "Failed to download highlighted PDF" });
  }
};

/**
 * Grade a submission (teacher)
 * Route: POST /api/submissions/:submissionId/grade
 */
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

    // Prisma schema expects grade as number (nullable) — ensure it's a number or null
    const gradeValue = grade !== undefined && grade !== null ? Number(grade) : null;

    const updatedSubmission = await prisma.submission.update({
      where: { id: submissionId },
      data: ({
        grade: gradeValue,
        feedback: feedback ?? null,
        status: "GRADED",
      } as any),
    });

    res.status(200).json(updatedSubmission);
  } catch (err) {
    console.error("Grading error", err);
    return res.status(500).json({ error: "Failed to grade submission." });
  }
};

/**
 * Reject a submission (teacher) with a note
 * Route: POST /api/submissions/:submissionId/reject
 * Body: { note: string }
 */
export const rejectSubmission = async (req: Request, res: Response) => {
  try {
    const { submissionId } = req.params;
    const { note } = req.body as { note?: string };
    const teacherId = (req as any).user.id;

    const submission = await prisma.submission.findFirst({
      where: { id: submissionId, assignment: { class: { teacherId } } },
      include: { assignment: true },
    });
    if (!submission) return res.status(403).json({ error: "You are not authorized to reject this submission." });

    const updated = await prisma.submission.update({
      where: { id: submissionId },
      data: ({
        status: "REJECTED",
        rejectionNote: note || null,
        rejectedAt: new Date(),
        // clear grade/feedback if previously graded
        grade: null,
        feedback: null,
      } as any),
    });
    return res.json(updated);
  } catch (err) {
    console.error("rejectSubmission error", err);
    return res.status(500).json({ error: "Failed to reject submission." });
  }
};

/**
 * Unsubmit (student retracts their submission) — used to resubmit
 * Route: DELETE /api/submissions/:assignmentId
 */
export const unsubmitSubmission = async (req: Request, res: Response) => {
  try {
    const { assignmentId } = req.params;
    const studentId = (req as any).user.id;

    const existing = await prisma.submission.findFirst({
      where: { assignmentId, studentId },
      orderBy: { createdAt: "desc" },
    });
    if (!existing) return res.status(404).json({ error: "No submission to unsubmit." });

    // Only allow unsubmit if not graded
    if (existing.grade !== null && existing.grade !== undefined) {
      return res.status(400).json({ error: "Cannot unsubmit a graded submission." });
    }

    await prisma.$transaction(async (tx) => {
      // Delete dependent records first to satisfy FK constraints
      await tx.plagiarismReport.deleteMany({ where: { submissionId: existing.id } });
      await tx.submissionChunk.deleteMany({ where: { submissionId: existing.id } });
      await tx.submissionComment.deleteMany({ where: { submissionId: existing.id } });
      await tx.submission.delete({ where: { id: existing.id } });
    });
    return res.json({ success: true });
  } catch (err) {
    console.error("unsubmitSubmission error", err);
    return res.status(500).json({ error: "Failed to unsubmit." });
  }
};
