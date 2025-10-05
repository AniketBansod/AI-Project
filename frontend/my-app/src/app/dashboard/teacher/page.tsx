// my-app/src/app/dashboard/teacher/page.tsx
"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PlusCircle } from "lucide-react";
import Link from "next/link"; 
// Shadcn UI components are no longer imported

interface Class {
  id: string;
  title: string;
  joinCode: string;
}

export default function TeacherDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [classes, setClasses] = useState<Class[]>([]);
  const [newClassTitle, setNewClassTitle] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false); // State to control our custom modal

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      router.push("/login");
      return;
    }
    setUser(JSON.parse(userData));

    const fetchClasses = async () => {
      const token = localStorage.getItem("token");
      try {
        const res = await fetch("http://localhost:5000/api/classes", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to fetch classes");
        const data = await res.json();
        setClasses(data);
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchClasses();
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  const handleCreateClass = async (e: FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem("token");
    try {
      const res = await fetch("http://localhost:5000/api/classes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: newClassTitle }),
      });
      if (!res.ok) throw new Error("Failed to create class");
      const newClass = await res.json();
      setClasses([newClass, ...classes]);
      setNewClassTitle("");
      setIsModalOpen(false); // Close the modal on success
    } catch (error) {
      console.error(error);
    }
  };

  if (!user) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <h1 className="text-xl font-semibold text-gray-900 self-center">Teacher Dashboard</h1>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-700">Welcome, {user.email}</span>
                <button
                  onClick={handleLogout}
                  className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded text-sm font-semibold"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </nav>

        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800">Your Classes</h2>
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
            >
              <PlusCircle className="mr-2 h-4 w-4" /> Create Class
            </button>
          </div>
          
          {isLoading ? (
            <p>Loading classes...</p>
          ) : classes.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {classes.map((cls) => (
                  <Link href={`/dashboard/teacher/class/${cls.id}`} key={cls.id}>
                    <div className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow cursor-pointer">
                      <h3 className="text-lg font-bold text-gray-900">{cls.title}</h3>
                       <p className="text-sm text-gray-500 mt-2">Join Code: 
                      <span className="font-mono bg-gray-100 p-1 rounded ml-2">{cls.joinCode}</span>
                      </p>
                    </div>
                  </Link> 
              ))}
            </div>
          ) : (
            <div className="text-center bg-white p-12 rounded-lg shadow">
              <h3 className="text-lg font-medium text-gray-900">No classes found</h3>
              <p className="mt-1 text-sm text-gray-500">
                Click "Create Class" to set up your first classroom.
              </p>
            </div>
          )}
        </main>
      </div>

      {/* --- Custom Modal Implementation --- */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Modal Overlay */}
          <div
            className="fixed inset-0 bg-black bg-opacity-50"
            onClick={() => setIsModalOpen(false)}
          ></div>
          
          {/* Modal Content */}
          <div className="relative bg-white p-8 rounded-lg shadow-xl w-full max-w-md">
            <h2 className="text-xl font-bold mb-2">Create a New Class</h2>
            <p className="text-sm text-gray-600 mb-4">
              Enter a title for your new class to get started.
            </p>
            <form onSubmit={handleCreateClass}>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700">
                Class Title
              </label>
              <input
                id="title"
                type="text"
                value={newClassTitle}
                onChange={(e) => setNewClassTitle(e.target.value)}
                placeholder="e.g., Grade 10 Physics"
                required
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
              <div className="mt-6 flex justify-end space-x-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}