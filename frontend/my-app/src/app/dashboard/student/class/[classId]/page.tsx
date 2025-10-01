// my-app/src/app/dashboard/student/class/[classId]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
interface Assignment {
  id: string;
  title: string;
  description: string;
  deadline: string;
  points: number | null;
}

interface ClassData {
  id: string;
  title: string;
  teacher: { name: string };
  assignments: Assignment[];
}

export default function StudentClassDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { classId } = params;

  const [classData, setClassData] = useState<ClassData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!classId) return;
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    const fetchClassData = async () => {
      try {
        const res = await fetch(`http://localhost:5000/api/classes/${classId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to fetch class data");
        const data = await res.json();
        setClassData(data);
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchClassData();
  }, [classId, router]);

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading class details...</div>;
  }

  if (!classData) {
    return <div className="flex items-center justify-center min-h-screen">Class not found.</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <header className="max-w-7xl mx-auto mb-8">
          <h1 className="text-3xl font-bold text-gray-900">{classData.title}</h1>
         <p className="text-md text-gray-500 mt-2">
  Taught by {classData.teacher?.name || 'N/A'}
</p>
      </header>

      <main className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Assignments</h2>
        </div>

        <div className="space-y-4">
          {classData.assignments?.length > 0 ?  (
            classData.assignments.map(assignment => (
              <div key={assignment.id} className="bg-white p-6 rounded-lg shadow">
    <div className="flex justify-between items-center">
        <div>
            <h3 className="text-lg font-semibold text-gray-900">{assignment.title}</h3>
            <p className="text-sm text-gray-500 mt-2">
                Due: {new Date(assignment.deadline).toLocaleDateString()}
            </p>
        </div>
        {/* <-- Display points for the student --> */}
        <p className="text-sm font-semibold text-gray-600">
            {assignment.points ? `${assignment.points} Points` : 'Ungraded'}
        </p>
    </div>
    <p className="text-sm text-gray-700 mt-4 border-t pt-4">{assignment.description}</p>
    <div className="text-right mt-4">
        <Link href={`/dashboard/student/assignment/${assignment.id}`}>
            <button className="bg-blue-500 text-white font-bold py-2 px-4 rounded hover:bg-blue-600">
                View & Submit
            </button>
        </Link>
    </div>
</div>
            ))
          ) : (
            <div className="bg-white p-12 rounded-lg shadow text-center">
              <p className="text-gray-600">No assignments have been posted for this class yet.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}