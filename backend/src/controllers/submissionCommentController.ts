import { Request, Response } from "express";
import prisma from "../utils/prisma";

export const getCommentsForSubmission = async (req: Request, res: Response) => {
  try {
    const { submissionId } = req.params;
    const userId = (req as any).user.id;

    const submission = await prisma.submission.findFirst({
      where: {
        id: submissionId,
        OR: [
          { studentId: userId }, // The student who submitted
          { assignment: { class: { teacherId: userId } } }, // The teacher of the class
        ],
      },
      include: {
        comments: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, name: true, role: true } },
          },
        },
      },
    });

    if (!submission) {
      return res.status(403).json({ error: "You are not authorized to view these comments." });
    }

    res.json(submission.comments);
  } catch (err) {
    console.error("Error fetching comments:", err);
    res.status(500).json({ error: "Failed to fetch comments." });
  }
};

export const createCommentOnSubmission = async (req: Request, res: Response) => {
  try {
    const { submissionId } = req.params;
    const { content } = req.body;
    const authorId = (req as any).user.id;

    if (!content) {
      return res.status(400).json({ error: "Comment content cannot be empty." });
    }

    // Security check (re-using logic from getComments)
    const submission = await prisma.submission.findFirst({
      where: {
        id: submissionId,
        OR: [
          { studentId: authorId },
          { assignment: { class: { teacherId: authorId } } },
        ],
      },
    });

    if (!submission) {
      return res.status(403).json({ error: "You are not authorized to comment on this submission." });
    }

    const newComment = await prisma.submissionComment.create({
      data: {
        content,
        submissionId,
        authorId,
      },
      include: {
        author: { select: { id: true, name: true, role: true } },
      },
    });

    res.status(201).json(newComment);
  } catch (err) {
    console.error("Error creating comment:", err);
    res.status(500).json({ error: "Failed to create comment." });
  }
};