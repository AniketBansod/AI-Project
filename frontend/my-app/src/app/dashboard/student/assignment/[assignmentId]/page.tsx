// my-app/src/app/dashboard/student/assignment/[assignmentId]/page.tsx
"use client";

import { useEffect, useState, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";

interface AssignmentData {
  id: string;
  title: string;
  description: string;
  deadline: string;
  points: number | null;
}

export default function AssignmentSubmissionPage() {
  const router = useRouter();
  const params = useParams();
  const { assignmentId } = params;

  const [assignmentData, setAssignmentData] = useState<AssignmentData | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!assignmentId) return;
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    const fetchAssignmentData = async () => {
      try {
        const res = await fetch(
          `http://localhost:5000/api/assignments/${assignmentId}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        if (!res.ok) throw new Error("Failed to fetch assignment data");
        const data = await res.json();
        setAssignmentData(data);
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAssignmentData();
  }, [assignmentId, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const token = localStorage.getItem("token");

    const formData = new FormData();
    formData.append("content", content || "");
    if (file) {
      formData.append("file", file);
    }

    try {
      const res = await fetch(
        `http://localhost:5000/api/submissions/${assignmentId}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );

      if (!res.ok) {
        let errorMessage = "Submission failed";
        try {
          const data = await res.json();
          errorMessage = data.error || errorMessage;
        } catch {
          try {
            const text = await res.text();
            errorMessage = text || errorMessage;
          } catch {
            errorMessage = "Unknown error occurred";
          }
        }
        throw new Error(errorMessage);
      }

      setSuccess("Assignment submitted successfully!");
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (isLoading)
    return (
      <div className="flex items-center justify-center min-h-screen">
        Loading assignment...
      </div>
    );
  if (!assignmentData)
    return (
      <div className="flex items-center justify-center min-h-screen">
        Assignment not found.
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <main className="max-w-4xl mx-auto">
        <header className="mb-8 border-b pb-4">
          <h1 className="text-3xl font-bold text-gray-900">
            {assignmentData.title}
          </h1>
          <p className="text-md text-gray-500 mt-2">
            Due by:{" "}
            {new Date(assignmentData.deadline).toLocaleString()} |{" "}
            {assignmentData.points
              ? `${assignmentData.points} Points`
              : "Ungraded"}
          </p>
          <p className="text-sm text-gray-700 mt-4">
            {assignmentData.description}
          </p>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Your Submission</h2>

            <div>
              <label
                htmlFor="content"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Text Content
              </label>
              <textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={8}
                className="w-full p-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Type your response here..."
              />
            </div>

            <div className="mt-6">
              <label
                htmlFor="file-upload"
                className="block text-sm font-medium text-gray-700"
              >
                Attach a File
              </label>
              <input
                id="file-upload"
                type="file"
                onChange={(e) =>
                  setFile(e.target.files ? e.target.files[0] : null)
                }
                className="mt-2 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="submit"
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded"
              >
                Submit Assignment
              </button>
            </div>

            {success && (
              <p className="mt-4 text-center text-green-600">{success}</p>
            )}
            {error && (
              <p className="mt-4 text-center text-red-600">{error}</p>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}
