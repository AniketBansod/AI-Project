import { Request, Response } from "express";
import prisma from "../utils/prisma";
import { delKey, getJSON, setJSON } from "../services/redis";
const db = prisma as any; // use untyped access for newly added models until Prisma client is regenerated

// Create a class material (teacher)
export const createClassMaterial = async (req: Request, res: Response) => {
  try {
    const teacherId = (req as any).user.id;
    const { classId } = req.params;
    const { title, description, type, linkUrl } = req.body as { title: string; description?: string; type?: string; linkUrl?: string };
    const fileUrl = req.file ? (req.file as any).location : null;

    if (!title) return res.status(400).json({ error: "Title is required" });

    const cls = await prisma.class.findFirst({ where: { id: classId, teacherId } });
    if (!cls) return res.status(403).json({ error: "You are not the teacher of this class." });

  const mat = await db.classMaterial.create({
      data: {
        classId,
        createdById: teacherId,
        title,
        description: description || null,
        type: (type as any) || "NOTE",
        linkUrl: linkUrl || null,
        fileUrl: fileUrl || null,
      },
    });
    // Invalidate cache for this class materials
    await delKey(`class:${classId}:materials`);
    return res.status(201).json(mat);
  } catch (err) {
    console.error("createClassMaterial error", err);
    return res.status(500).json({ error: "Failed to create material" });
  }
};

// List class materials (teacher or enrolled student)
export const listClassMaterials = async (req: Request, res: Response) => {
  try {
    const { classId } = req.params;
    const user = (req as any).user;

    // authorize: teacher or enrolled student
    const cls = await prisma.class.findUnique({
      where: { id: classId },
      include: { students: { select: { id: true } } },
    });
    if (!cls) return res.status(404).json({ error: "Class not found" });
    const isTeacher = cls.teacherId === user.id;
    const isStudent = cls.students.some((s) => s.id === user.id);
    if (!isTeacher && !isStudent) return res.status(403).json({ error: "Access denied" });

    // Try cache first
    const cacheKey = `class:${classId}:materials`;
    const cached = await getJSON<any[]>(cacheKey);
    if (cached) return res.json(cached);

    const items = await db.classMaterial.findMany({
      where: { classId },
      orderBy: { createdAt: "desc" },
    });
    // Cache for 60 seconds
    await setJSON(cacheKey, items, 60);
    return res.json(items);
  } catch (err) {
    console.error("listClassMaterials error", err);
    return res.status(500).json({ error: "Failed to list materials" });
  }
};

// Delete class material (teacher)
export const deleteClassMaterial = async (req: Request, res: Response) => {
  try {
    const { classId, materialId } = req.params as { classId: string; materialId: string };
    const teacherId = (req as any).user.id;

    const cls = await prisma.class.findFirst({ where: { id: classId, teacherId } });
    if (!cls) return res.status(403).json({ error: "You are not the teacher of this class." });

  const deleted = await db.classMaterial.delete({ where: { id: materialId } });
  // Invalidate cache
  await delKey(`class:${classId}:materials`);
    return res.json({ success: true });
  } catch (err) {
    console.error("deleteClassMaterial error", err);
    return res.status(500).json({ error: "Failed to delete material" });
  }
};

// Create an assignment resource (teacher)
export const createAssignmentResource = async (req: Request, res: Response) => {
  try {
    const teacherId = (req as any).user.id;
    const { assignmentId } = req.params;
    const { title, description, type, linkUrl } = req.body as { title: string; description?: string; type?: string; linkUrl?: string };
    const fileUrl = req.file ? (req.file as any).location : null;

    if (!title) return res.status(400).json({ error: "Title is required" });

    const asg = await prisma.assignment.findFirst({ where: { id: assignmentId, class: { teacherId } } });
    if (!asg) return res.status(403).json({ error: "You are not authorized for this assignment." });

  const resrc = await db.assignmentResource.create({
      data: {
        assignmentId,
        title,
        description: description || null,
        type: (type as any) || "ATTACHMENT",
        linkUrl: linkUrl || null,
        fileUrl: fileUrl || null,
      },
    });
    return res.status(201).json(resrc);
  } catch (err) {
    console.error("createAssignmentResource error", err);
    return res.status(500).json({ error: "Failed to create resource" });
  }
};

// List assignment resources (teacher or enrolled student)
export const listAssignmentResources = async (req: Request, res: Response) => {
  try {
    const { assignmentId } = req.params;
    const user = (req as any).user;

    const asg = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { class: { include: { students: { select: { id: true } } } } },
    });
    if (!asg) return res.status(404).json({ error: "Assignment not found" });
    const isTeacher = asg.class.teacherId === user.id;
    const isStudent = asg.class.students.some((s) => s.id === user.id);
    if (!isTeacher && !isStudent) return res.status(403).json({ error: "Access denied" });

  const items = await db.assignmentResource.findMany({ where: { assignmentId }, orderBy: { createdAt: "desc" } });
    return res.json(items);
  } catch (err) {
    console.error("listAssignmentResources error", err);
    return res.status(500).json({ error: "Failed to list resources" });
  }
};

// Delete assignment resource (teacher)
export const deleteAssignmentResource = async (req: Request, res: Response) => {
  try {
    const { assignmentId, resourceId } = req.params as { assignmentId: string; resourceId: string };
    const teacherId = (req as any).user.id;
    const asg = await prisma.assignment.findFirst({ where: { id: assignmentId, class: { teacherId } } });
    if (!asg) return res.status(403).json({ error: "You are not authorized for this assignment." });
  await db.assignmentResource.delete({ where: { id: resourceId } });
    return res.json({ success: true });
  } catch (err) {
    console.error("deleteAssignmentResource error", err);
    return res.status(500).json({ error: "Failed to delete resource" });
  }
};
