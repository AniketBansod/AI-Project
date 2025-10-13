import { Request, Response } from "express";
import prisma from "../utils/prisma";

export const getReportBySubmissionId = async (req: Request, res: Response) => {
  try {
    const { submissionId } = req.params;
    const user = (req as any).user as { id: string; role: string };

    // Ensure teacher owns the class this submission belongs to
    const sub = await prisma.submission.findFirst({
      where: {
        id: submissionId,
        assignment: { class: { teacherId: user.id } },
      },
      select: { id: true },
    });
    if (!sub) return res.status(403).json({ error: "Not authorized to view this report." });

    const report = await prisma.plagiarismReport.findUnique({ where: { submissionId } });
    if (!report) return res.status(404).json({ error: "Report not found" });

    // Normalize shape for frontend
    const payload = {
      similarity: report.similarity ?? 0,
      similarity_score: report.similarity ?? 0,
      aiProbability: report.aiProbability ?? 0,
      ai_probability: report.aiProbability ?? 0,
      highlights: (report.highlights as any) ?? [],
      matches: (report.highlights as any) ?? [],
      status: report.status,
    };

    return res.json(payload);
  } catch (err) {
    console.error("getReportBySubmissionId error", err);
    return res.status(500).json({ error: "Failed to fetch report" });
  }
};
