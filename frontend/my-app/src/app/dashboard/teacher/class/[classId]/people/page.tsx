// my-app/src/app/dashboard/teacher/class/[classId]/people/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

interface Student {
  id: string;
  name: string;
  email: string;
}

interface ClassData {
  id: string;
  title: string;
  teacher: { name: string };
  students: Student[];
}

export default function PeoplePage() {
  const router = useRouter();
  const params = useParams();
  const { classId } = params;

  const [classData, setClassData] = useState<ClassData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchClassData = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token || !classId) return;

    try {
      setIsLoading(true);
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
  }, [classId]);

  useEffect(() => {
    fetchClassData();
  }, [fetchClassData]);

  const handleRemoveStudent = async (studentId: string) => {
    if (!window.confirm("Are you sure you want to remove this student from the class?")) {
      return;
    }

    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`http://localhost:5000/api/classes/${classId}/students/${studentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("Failed to remove student");

      // Refetch the data to update the list
      await fetchClassData();

    } catch (error) {
      console.error(error);
      alert("Could not remove student.");
    }
  };

  if (isLoading) return <div className="flex items-center justify-center min-h-screen">Loading Roster...</div>;
  if (!classData) return <div className="flex items-center justify-center min-h-screen">Class not found.</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
        <main className="max-w-4xl mx-auto">
            {/* Teachers Section */}
            <section>
                <h2 className="text-2xl text-blue-700 border-b-2 border-blue-700 pb-2 mb-4">Teachers</h2>
                <div className="flex items-center justify-between p-4 bg-white rounded-lg">
                    <p className="font-medium text-gray-800">{classData.teacher?.name}</p>
                </div>
            </section>

            {/* Students Section */}
            <section className="mt-8">
                <div className="flex items-center justify-between border-b-2 border-blue-700 pb-2 mb-4">
                    <h2 className="text-2xl text-blue-700">Students</h2>
                    <span className="font-semibold">{classData.students?.length} students</span>
                </div>
                <div className="space-y-3">
                    {classData.students?.length > 0 ? (
                        classData.students.map(student => (
                            <div key={student.id} className="flex items-center justify-between p-4 bg-white rounded-lg shadow-sm">
                                <p className="font-medium text-gray-800">{student.name}</p>
                                <button 
                                    onClick={() => handleRemoveStudent(student.id)}
                                    className="text-sm text-red-500 hover:text-red-700 hover:underline"
                                >
                                    Remove
                                </button>
                            </div>
                        ))
                    ) : (
                        <p className="text-gray-500 p-4 bg-white rounded-lg">No students have joined this class yet.</p>
                    )}
                </div>
            </section>
        </main>
    </div>
  );
}