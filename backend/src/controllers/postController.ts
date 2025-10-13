// src/controllers/postController.ts
import { Request, Response } from "express";
import prisma from "../utils/prisma";

export const createPost = async (req: Request, res: Response) => {
  try {
    const { classId } = req.params;
    const { content } = req.body;
    const authorId = (req as any).user.id;

    if (!content) {
      return res.status(400).json({ error: "Content is required" });
    }

    // Security Check: Verify the user is the teacher of this class
    const course = await prisma.class.findFirst({
      where: { id: classId, teacherId: authorId },
    });

    if (!course) {
      return res.status(403).json({ error: "You are not authorized to post in this class." });
    }

    const newPost = await prisma.post.create({
      data: {
        content,
        classId,
        authorId,
      },
    });

    res.status(201).json(newPost);
  } catch (err) {
    console.error("Error creating post:", err);
    res.status(500).json({ error: "Failed to create post" });
  }
};