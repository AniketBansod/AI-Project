// backend/worker.ts
import 'dotenv/config';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import axios from 'axios';
import prisma from './utils/prisma';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const S3_BUCKET = process.env.AWS_S3_BUCKET_NAME;

if (!S3_BUCKET) {
  console.warn('⚠️  S3_BUCKET not set. Highlighted PDF upload to S3 will fail.');
}

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const s3 = new S3Client({ region: AWS_REGION });

interface JobData {
  submissionId: string;
  assignmentId?: string;
  fileUrl?: string | null;
}

interface AiResult {
  similarity_score: number;
  ai_probability: number;
  matches: { submission_id: string; similarity: number }[];
}

console.log('🚀 Worker started, listening on queue "plagiarism-checks"...');

const worker = new Worker<JobData>(
  'plagiarism-checks',
  async (job) => {
    const { submissionId } = job.data;
    if (!submissionId) throw new Error('Job missing submissionId');

    console.log(`🧠 Worker: Processing submission ${submissionId}`);

    // Fetch submission
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: { id: true, content: true, fileUrl: true, assignmentId: true },
    });

    if (!submission) {
      console.warn(`⚠️ Worker: submission ${submissionId} not found — skipping`);
      return;
    }

    // 1️⃣ Call AI service /check
    let aiResult: AiResult | null = null;
    try {
      const resp = await axios.post<AiResult>(
        `${AI_SERVICE_URL}/check`,
        {
          submission_id: submission.id,
          assignment_id: submission.assignmentId,
          text_content: submission.content,
          file_url: submission.fileUrl,
        },
        { timeout: 15 * 60 * 1000 } // 15-minute timeout safety
      );
      aiResult = resp.data;
      console.log(`✅ Worker: AI check complete for ${submissionId} (similarity=${aiResult.similarity_score.toFixed(3)}, ai_prob=${aiResult.ai_probability.toFixed(3)})`);
    } catch (err) {
      const errorMessage = (err instanceof Error) ? err.message : String(err);
      console.error(`❌ Worker: AI /check failed for ${submissionId}:`, errorMessage);
      // mark REPORT as FAILED
      try {
        await prisma.plagiarismReport.upsert({
          where: { submissionId },
          update: { status: 'FAILED' },
          create: {
            submissionId,
            similarity: 0.0,
            aiProbability: 0.0,
            highlights: [],
            status: 'FAILED',
          },
        });
      } catch (e) {
        console.error('Worker: failed to mark report as FAILED', e);
      }
      throw err;
    }

    // 2️⃣ Resolve student names for matches
    let matchesWithNames: any[] = [];
    try {
      const matchedIds = aiResult?.matches?.map((m) => m.submission_id) || [];
      const matchedSubs =
        matchedIds.length > 0
          ? await prisma.submission.findMany({
              where: { id: { in: matchedIds } },
              select: { id: true, student: { select: { name: true } } },
            })
          : [];

      matchesWithNames =
        aiResult?.matches?.map((m) => {
          const found = matchedSubs.find((s) => s.id === m.submission_id);
          return {
            submission_id: m.submission_id,
            similarity: m.similarity,
            studentName: found?.student?.name || 'Unknown',
          };
        }) || [];
    } catch (err) {
      console.warn('⚠️ Worker: could not resolve student names for matches', err);
      matchesWithNames = aiResult?.matches || [];
    }

    // 3️⃣ Upsert plagiarism report
    try {
      await prisma.plagiarismReport.upsert({
        where: { submissionId: submission.id },
        update: {
          similarity: aiResult!.similarity_score,
          aiProbability: aiResult!.ai_probability,
          highlights: matchesWithNames as any,
          status: 'COMPLETED',
        },
        create: {
          submissionId: submission.id,
          similarity: aiResult!.similarity_score,
          aiProbability: aiResult!.ai_probability,
          highlights: matchesWithNames as any,
          status: 'COMPLETED',
        },
      });
      console.log(`📦 Worker: plagiarismReport written for ${submissionId}`);
    } catch (err) {
      console.error('❌ Worker: failed to write plagiarism report to DB:', err);
    }

    // 4️⃣ Generate highlighted PDF + upload to S3
    if (submission.fileUrl && S3_BUCKET) {
      try {
        console.log(`🖍️ Worker: Requesting highlighted PDF for ${submission.id}`);
        const resp = await axios.post<ArrayBuffer>(
          `${AI_SERVICE_URL}/highlight_pdf`,
          {
            file_url: submission.fileUrl,
            submission_id: submission.id,
            assignment_id: submission.assignmentId,
          },
          { responseType: 'arraybuffer', timeout: 10 * 60 * 1000 }
        );

        const buffer = Buffer.from(resp.data);
        const key = `highlighted/${submission.id}.pdf`;

        await s3.send(
          new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: key,
            Body: buffer,
            ContentType: 'application/pdf',
          })
        );

        console.log(`✅ Worker: uploaded highlighted PDF to s3://${S3_BUCKET}/${key}`);
      } catch (err) {
        console.error(`⚠️ Worker: highlight PDF generation/upload failed for ${submission.id}`, err);
      }
    } else {
      console.log(`ℹ️ Worker: no fileUrl or S3_BUCKET not set — skipping highlight for ${submission.id}`);
    }

    console.log(`🎯 Worker: finished processing submission ${submissionId}`);
  },
  {
    connection,
    // automatic cleanup to keep Redis small
    removeOnComplete: { age: 3600, count: 1000 }, // keep jobs for 1 hour or last 1000
    removeOnFail: { age: 86400 }, // failed jobs kept 24h
  }
);

// Handle job failures globally
worker.on('failed', async (job, err) => {
  if (!job) {
    console.error('Worker: a job failed but job is undefined', err);
    return;
  }
  console.error(`❌ Worker: job ${job.id} failed:`, err);

  // update report status in case of failure
  try {
    await prisma.plagiarismReport.updateMany({
      where: { submissionId: (job.data as any).submissionId },
      data: { status: 'FAILED' },
    });
  } catch (e) {
    console.error('Worker: failed to mark job as FAILED in DB', e);
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Worker: shutting down...');
  await worker.close();
  await connection.quit();
  process.exit(0);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection in worker:', err);
});
