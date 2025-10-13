// src/controllers/commentController.ts
import { Request, Response } from "express";
import prisma from "../utils/prisma";

export const createComment = async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;
    const { content } = req.body;
    const authorId = (req as any).user.id;

    if (!content) {
      return res.status(400).json({ error: "Comment content cannot be empty" });
    }

    // Security Check: Verify user is part of the class where the post was made
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: {
        class: {
          select: {
            teacherId: true,
            students: { where: { id: authorId } },
          },
        },
      },
    });

    const isTeacher = post?.class.teacherId === authorId;
    const isStudent = (post?.class?.students?.length ?? 0) > 0;

    if (!post || (!isTeacher && !isStudent)) {
      return res.status(403).json({ error: "You are not authorized to comment on this post." });
    }

    const newComment = await prisma.comment.create({
      data: {
        content,
        postId,
        authorId,
      },
      include: {
        author: { select: { name: true } }, // Return author name with new comment
      }
    });

    res.status(201).json(newComment);
  } catch (err) {
    console.error("Error creating comment:", err);
    res.status(500).json({ error: "Failed to create comment" });
  }
};