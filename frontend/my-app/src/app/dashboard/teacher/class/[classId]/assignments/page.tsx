"use client";

import { useEffect, useState, FormEvent, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { PlusCircle } from "lucide-react";

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
  assignments: Assignment[];
}

export default function AssignmentsPage() {
  const router = useRouter();
  const params = useParams();
  const { classId } = params;

  const [classData, setClassData] = useState<ClassData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [assignmentDesc, setAssignmentDesc] = useState("");
  const [assignmentDeadline, setAssignmentDeadline] = useState("");
  const [assignmentPoints, setAssignmentPoints] = useState("");

  const fetchClassData = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token || !classId) {
      setIsLoading(false);
      return;
    }
    
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
  }, [classId]);

  useEffect(() => {
    fetchClassData();
  }, [fetchClassData]);

  const handleCreateAssignment = async (e: FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem("token");
    try {
      await fetch(`http://localhost:5000/api/assignments/${classId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: assignmentTitle,
          description: assignmentDesc,
          deadline: assignmentDeadline,
          points: assignmentPoints || null,
        }),
      });
      setIsModalOpen(false);
      setAssignmentTitle("");
      setAssignmentDesc("");
      setAssignmentDeadline("");
      setAssignmentPoints("");
      fetchClassData(); // Refetch after creating
    } catch (error) {
      console.error(error);
    }
  };

  if (isLoading) {
    return <div>Loading assignments...</div>;
  }

  if (!classData) {
    return <div>Could not load class data.</div>;
  }

  return (
    <>
      <div className="flex justify-end items-center mb-6">
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
        >
          <PlusCircle className="mr-2 h-4 w-4" /> Create Assignment
        </button>
      </div>

      <div className="space-y-4">
        {classData.assignments?.length > 0 ? (
          classData.assignments.map(assignment => (
            <Link href={`/dashboard/teacher/assignment/${assignment.id}`} key={assignment.id}>
                <div className="bg-white p-4 rounded-lg shadow hover:shadow-md transition-shadow cursor-pointer">
                    <div className="flex justify-between items-start">
                        <div>
                            <h3 className="text-lg font-semibold">{assignment.title}</h3>
                            <p className="text-xs text-gray-500 mt-2">
                                Deadline: {new Date(assignment.deadline).toLocaleDateString()}
                            </p>
                        </div>
                        <p className="text-sm font-semibold text-gray-600">
                            {assignment.points ? `${assignment.points} Points` : 'Ungraded'}
                        </p>
                    </div>
                    <p className="text-sm text-gray-600 mt-3 pt-3 border-t">{assignment.description}</p>
                </div>
            </Link>
          ))
        ) : (
          <p className="text-gray-500">No assignments have been created for this class yet.</p>
        )}
      </div>

      {isModalOpen && (
         <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative bg-white p-8 rounded-lg shadow-xl w-full max-w-lg">
            <h2 className="text-xl font-bold mb-4">New Assignment</h2>
            <form onSubmit={handleCreateAssignment} className="space-y-4">
              <div>
                <label htmlFor="title" className="block text-sm font-medium">Title</label>
                <input id="title" type="text" value={assignmentTitle} onChange={(e) => setAssignmentTitle(e.target.value)} required className="mt-1 block w-full px-3 py-2 border rounded-md"/>
              </div>
              <div>
                <label htmlFor="description" className="block text-sm font-medium">Description</label>
                <textarea id="description" value={assignmentDesc} onChange={(e) => setAssignmentDesc(e.target.value)} required rows={4} className="mt-1 block w-full px-3 py-2 border rounded-md"/>
              </div>
              <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="deadline" className="block text-sm font-medium">Deadline</label>
                    <input id="deadline" type="date" value={assignmentDeadline} onChange={(e) => setAssignmentDeadline(e.target.value)} required className="mt-1 block w-full px-3 py-2 border rounded-md"/>
                  </div>
                  <div>
                    <label htmlFor="points" className="block text-sm font-medium">Points</label>
                    <input id="points" type="number" value={assignmentPoints} onChange={(e) => setAssignmentPoints(e.target.value)} placeholder="e.g., 100 (optional)" className="mt-1 block w-full px-3 py-2 border rounded-md"/>
                  </div>
              </div>
              <div className="flex justify-end space-x-4 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded">Cancel</button>
                <button type="submit" className="bg-blue-500 text-white font-bold py-2 px-4 rounded">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}