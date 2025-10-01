// src/controllers/assignmentController.ts
import { Request, Response } from "express";
import prisma from "../utils/prisma";

// In src/controllers/assignmentController.ts

export const createAssignment = async (req: Request, res: Response) => {
  try {
    const { classId } = req.params;
    // 1. Destructure `points` from the request body
    const { title, description, deadline, points } = req.body;
    const teacherId = (req as any).user.id;

    if (!title || !description || !deadline) {
      return res.status(400).json({ error: "Title, description, and deadline are required" });
    }

    // Security Check remains the same
    const course = await prisma.class.findFirst({
        where: { id: classId, teacherId }
    });

    if (!course) {
        return res.status(403).json({ error: "You are not the teacher of this class." });
    }

    const newAssignment = await prisma.assignment.create({
      data: {
        title,
        description,
        deadline: new Date(deadline),
        // 2. Add the points value, converting it to an integer
        points: points ? parseInt(points, 10) : null,
        classId,
      },
    });

    res.status(201).json(newAssignment);
  } catch (err) {
    console.error("Error creating assignment:", err);
    res.status(500).json({ error: "Failed to create assignment" });
  }
};
// Add this to src/controllers/assignmentController.ts

export const getAssignmentById = async (req: Request, res: Response) => {
  try {
    const { assignmentId } = req.params;
    const studentId = (req as any).user.id;

    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        class: {
          include: {
            students: { where: { id: studentId } },
          },
        },
      },
    });

    // Security Check: Ensure the assignment exists and the student is enrolled in the class
    if (!assignment || assignment.class.students.length === 0) {
      return res.status(403).json({ error: "You do not have access to this assignment." });
    }

    res.json(assignment);
  } catch (err) {
    console.error("Error fetching assignment:", err);
    res.status(500).json({ error: "Failed to fetch assignment details" });
  }
};

// Add this to src/controllers/assignmentController.ts

export const getSubmissionsForAssignment = async (req: Request, res: Response) => {
  try {
    const { assignmentId } = req.params;
    const teacherId = (req as any).user.id;

    // First, verify the teacher owns the assignment's class
    const assignment = await prisma.assignment.findFirst({
      where: {
        id: assignmentId,
        class: {
          teacherId: teacherId,
        },
      },
    });

    if (!assignment) {
      return res.status(403).json({ error: "You do not have access to this assignment's submissions." });
    }

    // If authorized, fetch all submissions for that assignment
    const submissions = await prisma.submission.findMany({
      where: { assignmentId },
      orderBy: { createdAt: 'desc' },
      include: {
        student: {
          select: {
            name: true,
            email: true,
          },
        },
        report: true, // <-- Add this line to include the report
      },
    });


    res.json(submissions);
  } catch (err) {
    console.error("Error fetching submissions:", err);
    res.status(500).json({ error: "Failed to fetch submissions" });
  }
};