import { Worker } from 'bullmq';
import prisma from './utils/prisma';
import axios from 'axios';
import IORedis from 'ioredis';
import dotenv from 'dotenv';
import { Prisma } from '@prisma/client';

dotenv.config();

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) throw new Error('REDIS_URL not defined');

const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

interface AiResponseData {
  similarity_score: number;
  ai_probability: number;
  matches: { submission_id: string; similarity: number }[];
}

interface Highlight {
  submission_id: string;
  similarity: number;
  studentName: string;
}

// Worker to process plagiarism jobs
const worker = new Worker(
  'plagiarism-checks',
  async (job) => {
    const { submissionId } = job.data;
    console.log(`Processing job for submission ID: ${submissionId}`);

    try {
      const submission = await prisma.submission.findUnique({ where: { id: submissionId } });
      if (!submission) throw new Error('Submission not found.');

      const aiResponse = await axios.post<AiResponseData>('http://127.0.0.1:8000/check', {
        submission_id: submission.id,
        assignment_id: submission.assignmentId,
        text_content: submission.content,
        file_url: submission.fileUrl,
      });

      const { similarity_score, ai_probability, matches } = aiResponse.data;

      // Bulk fetch all matching submissions
      const matchIds = matches.map((m) => m.submission_id);
      const matchSubmissions = await prisma.submission.findMany({
        where: { id: { in: matchIds } },
        select: { id: true, student: { select: { name: true } } },
      });

      const matchesWithStudentNames: Highlight[] = matches.map((m) => {
        const sub = matchSubmissions.find((s) => s.id === m.submission_id);
        return {
          submission_id: m.submission_id,
          similarity: m.similarity,
          studentName: sub?.student.name || 'Unknown',
        };
      });

      await prisma.plagiarismReport.update({
        where: { submissionId: submission.id },
        data: {
          similarity: similarity_score,
          aiProbability: ai_probability,
          highlights: matchesWithStudentNames as unknown as Prisma.InputJsonValue,
          status: 'COMPLETED',
        },
      });

      console.log(`Job completed for submission ID: ${submissionId}`);
    } catch (error) {
      console.error(`Job failed for submission ID: ${submissionId}`, error);
      await prisma.plagiarismReport.update({
        where: { submissionId },
        data: { status: 'FAILED' },
      });
      throw error;
    }
  },
  { connection }
);

console.log('Worker is listening for jobs...');

// ----------------------------
// One-time function to update old reports with student names
export const updateOldReportsWithNames = async () => {
  // Fetch all reports (we filter in code because Prisma JSON filters are limited)
  const reports = await prisma.plagiarismReport.findMany();

  for (const report of reports) {
    if (!Array.isArray(report.highlights) || report.highlights.length === 0) continue;

    // Only update entries missing studentName
    const needsUpdate = report.highlights.some(
      (h: any) => !('studentName' in h) || !h.studentName
    );
    if (!needsUpdate) continue;

    const matchIds = report.highlights.map((h: any) => h.submission_id);
    const matchSubmissions = await prisma.submission.findMany({
      where: { id: { in: matchIds } },
      select: { id: true, student: { select: { name: true } } },
    });

    const updatedHighlights = report.highlights.map((h: any) => {
      const sub = matchSubmissions.find((s) => s.id === h.submission_id);
      return { ...h, studentName: sub?.student.name || 'Unknown' };
    });

    await prisma.plagiarismReport.update({
      where: { id: report.id },
      data: { highlights: updatedHighlights as unknown as Prisma.InputJsonValue },
    });
  }

  console.log('Old reports updated with student names!');
};

// Run once if needed
// updateOldReportsWithNames();
