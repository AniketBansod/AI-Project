// src/controllers/classController.ts
import { Request, Response } from "express";
import prisma from "../utils/prisma";

// Helper function to generate a random 6-character join code
const generateJoinCode = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

// -------------------- Create Class --------------------
export const createClass = async (req: Request, res: Response) => {
  try {
    const { title } = req.body;
    const teacherId = (req as any).user.id;

    if (!title) {
      return res.status(400).json({ error: "Title is required" });
    }

    // Generate join code (consider checking uniqueness in production)
    const joinCode = generateJoinCode();

    const newClass = await prisma.class.create({
      data: {
        title,
        teacherId,
        joinCode,
      },
      include: {
        teacher: { select: { name: true } }, // include teacher info immediately
      },
    });

    res.status(201).json(newClass);
  } catch (err) {
    console.error("Error creating class:", err);
    res.status(500).json({ error: "Failed to create class" });
  }
};

// -------------------- Get Classes For Teacher --------------------
export const getClassesForTeacher = async (req: Request, res: Response) => {
  try {
    const teacherId = (req as any).user.id;

    const classes = await prisma.class.findMany({
      where: { teacherId },
      orderBy: { createdAt: "desc" },
      include: {
        students: { select: { id: true, name: true } }, // optional: include students
      },
    });

    res.json(classes);
  } catch (err) {
    console.error("Error fetching classes:", err);
    res.status(500).json({ error: "Failed to fetch classes" });
  }
};

// -------------------- Join Class --------------------
export const joinClass = async (req: Request, res: Response) => {
  try {
    const { joinCode } = req.body;
    const studentId = (req as any).user.id;

    if (!joinCode) {
      return res.status(400).json({ error: "Join code is required" });
    }

    const classToJoin = await prisma.class.findUnique({
      where: { joinCode },
    });

    if (!classToJoin) {
      return res.status(404).json({ error: "Class with that code not found" });
    }

    // Check if already enrolled
    const isAlreadyEnrolled = await prisma.class.findFirst({
      where: {
        id: classToJoin.id,
        students: { some: { id: studentId } },
      },
    });

    if (isAlreadyEnrolled) {
      return res
        .status(400)
        .json({ error: "You are already enrolled in this class." });
    }

    // Connect student to the class
    await prisma.class.update({
      where: { id: classToJoin.id },
      data: {
        students: { connect: { id: studentId } },
      },
    });

    // 🔑 Refetch the class including teacher info
    const enrolledClass = await prisma.class.findUnique({
      where: { id: classToJoin.id },
      include: {
        teacher: { select: { name: true } },
        students: { select: { id: true, name: true } }, // optional: include students
      },
    });

    res.json(enrolledClass);
  } catch (err) {
    console.error("Error joining class:", err);
    res.status(500).json({ error: "Failed to join class" });
  }
};

// -------------------- Get Enrolled Classes For Student --------------------
export const getEnrolledClasses = async (req: Request, res: Response) => {
  try {
    const studentId = (req as any).user.id;

    const classes = await prisma.class.findMany({
      where: { students: { some: { id: studentId } } },
      orderBy: { createdAt: "desc" },
      include: {
        teacher: { select: { name: true } },
      },
    });
    res.json(classes);
  } catch (err) {
    console.error("Error fetching enrolled classes:", err);
    res.status(500).json({ error: "Failed to fetch classes" });
  }
};

// -------------------- Get Class By ID --------------------
// In src/controllers/classController.ts

export const getClassById = async (req: Request, res: Response) => {
  try {
    const { classId } = req.params;

    // The canAccessClass middleware has already verified permission.
    const course = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        // Data for Assignments Page
        assignments: { 
          orderBy: { createdAt: 'desc' } 
        },
        // Data for People Page
        teacher: { 
          select: { name: true } 
        },
        students: { 
          select: { id: true, name: true, email: true },
          orderBy: { name: 'asc' }
        },
        // Data for Stream Page
        posts: {
          orderBy: { createdAt: 'desc' },
          include: {
            author: { select: { name: true } },
            comments: {
              orderBy: { createdAt: 'asc' },
              include: {
                author: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    if (!course) {
      return res.status(404).json({ error: "Class not found" });
    }

    res.json(course);
  } catch (err) {
    console.error("Error fetching class:", err);
    res.status(500).json({ error: "Failed to fetch class details" });
  }
};


export const removeStudentFromClass = async (req: Request, res: Response) => {
  try {
    const { classId, studentId } = req.params;
    const teacherId = (req as any).user.id;

    // Security Check: Verify the user is the teacher of this class
    const course = await prisma.class.findFirst({
      where: { id: classId, teacherId },
    });

    if (!course) {
      return res.status(403).json({ error: "You are not the teacher of this class." });
    }

    // Disconnect the student from the class
    await prisma.class.update({
      where: { id: classId },
      data: {
        students: {
          disconnect: { id: studentId },
        },
      },
    });

    res.status(200).json({ message: "Student removed successfully." });
  } catch (err) {
    console.error("Error removing student:", err);
    res.status(500).json({ error: "Failed to remove student" });
  }
};