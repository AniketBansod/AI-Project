// src/controllers/submissionController.ts
import { Request, Response } from "express";
import prisma from "../utils/prisma";
import { plagiarismQueue } from "../queues/plagiarismQueue";
import axios from "axios";
import { Readable } from "stream";

interface MulterS3File extends Express.Multer.File {
  location?: string;
}

export const createSubmission = async (req: Request, res: Response) => {
  try {
    const { assignmentId } = req.params;
    const { content } = req.body;
    const studentId = (req as any).user.id;
    const file = req.file as MulterS3File | undefined;

    if (!content && !file) {
      return res
        .status(400)
        .json({ error: "Submission must include content or a file." });
    }

    // 1. Save the submission to the database
    const newSubmission = await prisma.submission.create({
      data: {
        content: content || "",
        fileUrl: file?.location,
        studentId,
        assignmentId,
      },
    });

    // 2. Create a placeholder plagiarism report
    await prisma.plagiarismReport.create({
      data: {
        submissionId: newSubmission.id,
        status: "PENDING",
        similarity: 0,
        aiProbability: 0,
        highlights: {},
      },
    });

    // 3. Add a job to the queue to process this submission
    await plagiarismQueue.add("check-plagiarism", {
      submissionId: newSubmission.id,
    });

    console.log(`Added job to queue for submission ${newSubmission.id}`);

    // 4. Respond to the user immediately
    res.status(201).json(newSubmission);
  } catch (err: unknown) {
    console.error("Error creating submission:", err);

    let message = "Unknown error";
    if (err instanceof Error) message = err.message;

    res.status(500).json({ error: message });
  }
};

export const addGradeToSubmission = async (req: Request, res: Response) => {
  try {
    const { submissionId } = req.params;
    const { grade } = req.body;
    const teacherId = (req as any).user.id;

    if (!grade) {
      return res.status(400).json({ error: "Grade is required" });
    }

    // Security Check
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: {
        assignment: {
          select: {
            class: {
              select: {
                teacherId: true,
              },
            },
          },
        },
      },
    });

    if (!submission || submission.assignment.class.teacherId !== teacherId) {
      return res
        .status(403)
        .json({ error: "You are not authorized to grade this submission." });
    }

    // If authorized, update the submission with the new grade
    const updatedSubmission = await prisma.submission.update({
      where: { id: submissionId },
      data: { grade },
      include: {
        student: {
          select: {
            name: true,
            email: true,
          },
        },
        report: true,
      },
    });

    res.json(updatedSubmission);
  } catch (err: unknown) {
    console.error("Error adding grade:", err);

    let message = "Unknown error";
    if (err instanceof Error) message = err.message;

    res.status(500).json({ error: message });
  }
};

/**
 * Download highlighted PDF (proxy to AI service)
 * Route: GET /api/submissions/:submissionId/highlighted-pdf
 * Authorization: only the teacher of the class can download
 */
export const downloadHighlightedPdf = async (req: Request, res: Response) => {
  try {
    const { submissionId } = req.params;
    const userId = (req as any).user.id;

    // Fetch submission and teacherId
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        fileUrl: true,
        assignment: {
          select: {
            class: {
              select: { teacherId: true },
            },
          },
        },
      },
    });

    if (!submission) return res.status(404).json({ error: "Submission not found" });

    const teacherId = submission.assignment?.class?.teacherId;
    if (!teacherId || teacherId !== userId)
      return res.status(403).json({ error: "Not authorized to download this file." });

    const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

    // Request highlighted PDF from AI service
    const aiResponse = await axios.post(
      `${AI_SERVICE_URL}/highlight_pdf`,
      { file_url: submission.fileUrl },
      { responseType: "stream" as const }
    );

    const contentType = aiResponse.headers["content-type"] || "application/pdf";
    const contentDisposition =
      aiResponse.headers["content-disposition"] ||
      `attachment; filename=submission_${submissionId}_highlighted.pdf`;

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", contentDisposition);

    const stream = aiResponse.data as unknown as Readable;
    stream.pipe(res);
  } catch (err: unknown) {
    console.error("Error fetching highlighted PDF:", err);

    let message = "Failed to fetch highlighted PDF";
    if (err instanceof Error) message = err.message;

    res.status(500).json({ error: message });
  }
};