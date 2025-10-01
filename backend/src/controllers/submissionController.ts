// src/controllers/submissionController.ts
import { Request, Response } from "express";
import prisma from "../utils/prisma";
import { plagiarismQueue } from "../queues/plagiarismQueue";

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
  } catch (err) {
    console.error("Error creating submission:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
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
  } catch (err) {
    console.error("Error adding grade:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
