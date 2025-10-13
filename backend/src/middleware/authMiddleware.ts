import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/auth";
import prisma from "../utils/prisma"; 
interface JwtPayload {
  id: string;
  role: string;
}

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "No token provided" });

  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Invalid token" });

  try {
    const decoded = verifyToken(token) as JwtPayload;
    (req as any).user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Unauthorized" });
  }
};

export const isTeacher = (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;

  if (user && user.role === 'TEACHER') {
    next();
  } else {
    res.status(403).json({ error: "Forbidden: Access is restricted to teachers." });
  }
};

export const isStudent = (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;

  if (user && user.role === 'STUDENT') {
    next();
  } else {
    res.status(403).json({ error: "Forbidden: Access is restricted to students." });
  }
};

export const canAccessClass = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { classId } = req.params;
        const user = (req as any).user;

        const course = await prisma.class.findFirst({
            where: {
                id: classId,
                OR: [
                    { teacherId: user.id },
                    { students: { some: { id: user.id } } }
                ]
            }
        });

        if (!course) {
            return res.status(403).json({ error: "Forbidden: You do not have access to this class." });
        }

        next();
    } catch (err) {
        res.status(500).json({ error: "Internal server error." });
    }
};
