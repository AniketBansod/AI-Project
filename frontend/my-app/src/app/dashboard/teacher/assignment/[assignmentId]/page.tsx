"use client";

import { useEffect, useState, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

// Interfaces
interface Match {
  submission_id: string;
  similarity: number;
  studentName?: string;
}
interface Report {
  id?: string;
  status?: "PENDING" | "COMPLETED" | "FAILED";
  // support both shapes: "similarity" (float 0..1) OR "similarity_score"
  similarity?: number;
  similarity_score?: number;
  // support both shapes: "aiProbability" OR "ai_probability"
  aiProbability?: number;
  ai_probability?: number;
  // highlights array (some backends use "highlights", some "matches")
  highlights?: Match[] | null;
  matches?: Match[] | null;
}
interface Submission {
  id: string;
  content: string;
  fileUrl: string | null;
  createdAt: string;
  grade: string | null;
  student: {
    name: string;
    email: string;
  };
  report: Report | null;
}

// Small helper: convert various raw values to percent (0..100) safely
function toPercent(value: any): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  if (isNaN(n)) return 0;
  // If value appears to be fraction between 0 and 1
  if (n > 0 && n <= 1) return Math.min(100, Math.round(n * 100));
  // If value already appears to be percentage in 0..100
  if (n >= 1 && n <= 100) return Math.min(100, Math.round(n));
  // otherwise clamp to 0
  return 0;
}

// ReportScores component — minimal changes: safe parsing & clamping
const ReportScores = ({ report }: { report: Report | null }) => {
  if (!report) {
    return (
      <div className="text-right">
        <p className="text-sm font-medium text-gray-600">Report</p>
        <span className="text-xs text-gray-500">Not Checked</span>
      </div>
    );
  }

  const status = report.status ?? "PENDING";

  switch (status) {
    case "PENDING":
      return (
        <div className="text-right">
          <p className="text-sm font-medium text-gray-600">Report</p>
          <div className="flex items-center justify-end text-xs text-blue-600 mt-1">
            <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600 mr-2"></span>
            Checking...
          </div>
        </div>
      );
    case "FAILED":
      return (
        <div className="text-right">
          <p className="text-sm font-medium text-gray-600">Report</p>
          <span className="text-xs font-semibold text-red-600">Failed</span>
        </div>
      );
    case "COMPLETED": {
      // pick similarity from either report.similarity or report.similarity_score
      const rawSimilarity = report.similarity ?? report.similarity_score ?? 0;
      const rawAi = report.aiProbability ?? report.ai_probability ?? 0;

      const simScore = toPercent(rawSimilarity);
      const aiScore = toPercent(rawAi);

      const getColor = (score: number) =>
        score > 70 ? "bg-red-500" : score > 40 ? "bg-yellow-500" : "bg-green-500";

      // get matches array from either highlights or matches
      const matches: Match[] = Array.isArray(report.highlights)
        ? (report.highlights as Match[])
        : Array.isArray(report.matches)
        ? (report.matches as Match[])
        : [];

      return (
        <div className="w-full">
          <div className="flex space-x-4">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600">Similarity</p>
              <div className="w-full bg-gray-200 h-4 rounded-full mt-1">
                <div
                  className={`${getColor(simScore)} h-4 rounded-full`}
                  style={{ width: `${simScore}%` }}
                ></div>
              </div>
              <span className="text-xs text-gray-600 mt-1 block">{simScore}%</span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600">AI Probability</p>
              <div className="w-full bg-gray-200 h-4 rounded-full mt-1">
                <div
                  className={`${getColor(aiScore)} h-4 rounded-full`}
                  style={{ width: `${aiScore}%` }}
                ></div>
              </div>
              <span className="text-xs text-gray-600 mt-1 block">{aiScore}%</span>
            </div>
          </div>

          {matches.length > 0 && (
            <div className="mt-3 pt-3 border-t text-right">
              <p className="text-xs font-bold text-gray-600">Top Matches:</p>
              <ul className="text-xs text-gray-500 space-y-1 mt-1">
                {matches.slice(0, 3).map((match) => (
                  <li key={match.submission_id}>
                    vs <span className="font-semibold text-black">{match.studentName || "Unknown"}</span>{" "}
                    ({toPercent(match.similarity)}%)
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    }
    default:
      return null;
  }
};

// Helper: parse filename from Content-Disposition header (unchanged)
function parseFilename(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;
  const match = /filename\*?=(?:UTF-8'')?['"]?([^;'"]+)['"]?/.exec(contentDisposition);
  if (match && match[1]) {
    return decodeURIComponent(match[1]);
  }
  return null;
}

// Main page component (unchanged except using ReportScores above)
export default function TeacherAssignmentPage() {
  const router = useRouter();
  const params = useParams();
  const { assignmentId } = params as { assignmentId?: string };
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [gradingSubmission, setGradingSubmission] = useState<Submission | null>(null);
  const [gradeInput, setGradeInput] = useState("");

  // configurable backend URL
  const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL as string) || "http://localhost:5000";

  useEffect(() => {
    if (!assignmentId) return;
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    const fetchSubmissions = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/assignments/${assignmentId}/submissions`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to fetch submissions");
        setSubmissions(await res.json());
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSubmissions();
  }, [assignmentId, router]);

  const handleOpenGradeModal = (submission: Submission) => {
    setGradingSubmission(submission);
    setGradeInput(submission.grade || "");
  };
  const handleCloseGradeModal = () => {
    setGradingSubmission(null);
    setGradeInput("");
  };
  const handleSaveGrade = async (e: FormEvent) => {
    e.preventDefault();
    if (!gradingSubmission) return;
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${BACKEND_URL}/api/submissions/${gradingSubmission.id}/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ grade: gradeInput }),
      });
      if (!res.ok) throw new Error("Failed to save grade");
      const updatedSubmission = await res.json();
      setSubmissions(submissions.map((s) => (s.id === updatedSubmission.id ? updatedSubmission : s)));
      handleCloseGradeModal();
    } catch (error) {
      console.error(error);
      alert("Failed to save grade.");
    }
  };

  // download highlighted PDF (unchanged)
  const downloadHighlightedPdf = async (submissionId: string) => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    try {
      const resp = await fetch(`${BACKEND_URL}/api/submissions/${submissionId}/highlighted-pdf`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!resp.ok) {
        const ct = resp.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          const j = await resp.json();
          alert(j.error || `Failed to download PDF (status ${resp.status})`);
        } else {
          alert(`Failed to download PDF (status ${resp.status})`);
        }
        return;
      }

      const blob = await resp.blob();
      const contentDisp = resp.headers.get("content-disposition");
      const filename = parseFilename(contentDisp) || `submission_${submissionId}_highlighted.pdf`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download error", err);
      alert("Network error while trying to download the highlighted PDF. Check console for details.");
    }
  };

  if (isLoading) return <div className="flex items-center justify-center min-h-screen">Loading submissions...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <main className="max-w-7xl mx-auto space-y-6">
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Submissions</h1>
        </header>

        {submissions.length > 0 ? (
          submissions.map((submission) => (
            <div key={submission.id} className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-start justify-between border-b pb-4 mb-4">
                <div>
                  <p className="font-semibold text-lg text-gray-800">{submission.student.name}</p>
                  <p className="text-sm text-gray-500">{submission.student.email}</p>
                </div>
                <ReportScores report={submission.report} />
              </div>

              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {submission.content && (
                    <div className="prose prose-sm max-w-none mb-4" dangerouslySetInnerHTML={{ __html: submission.content }} />
                  )}

                  {submission.fileUrl && (
                    <a href={submission.fileUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline font-semibold mr-4">
                      View Submitted File
                    </a>
                  )}

                  <button
                    onClick={() => downloadHighlightedPdf(submission.id)}
                    className="text-sm text-green-600 hover:underline font-semibold bg-transparent border-0 p-0"
                  >
                    Download Highlighted PDF
                  </button>
                </div>

                <div className="text-right ml-4 flex-shrink-0 w-28">
                  <p className="text-sm font-medium text-gray-600">Grade</p>
                  {submission.grade ? <p className="text-lg font-bold text-gray-800">{submission.grade}</p> : <p className="text-sm text-gray-500">Not Graded</p>}
                  <button onClick={() => handleOpenGradeModal(submission)} className="mt-2 text-sm text-blue-600 hover:underline">
                    {submission.grade ? "Edit" : "Add Grade"}
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center bg-white p-12 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900">No submissions yet</h3>
          </div>
        )}
      </main>

      {gradingSubmission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={handleCloseGradeModal}></div>
          <div className="relative bg-white p-8 rounded-lg shadow-xl w-full max-w-sm">
            <h2 className="text-xl font-bold mb-4">Grade Submission</h2>
            <form onSubmit={handleSaveGrade}>
              <label htmlFor="grade" className="block text-sm font-medium text-gray-700">Grade</label>
              <input id="grade" type="text" value={gradeInput} onChange={(e) => setGradeInput(e.target.value)} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" placeholder="e.g., 95/100 or A+" />
              <div className="flex justify-end space-x-4 mt-6">
                <button type="button" onClick={handleCloseGradeModal} className="bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded">Cancel</button>
                <button type="submit" className="bg-blue-500 text-white font-bold py-2 px-4 rounded">Save Grade</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
