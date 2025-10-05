// my-app/src/app/dashboard/student/class/[classId]/stream/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import CommentSection from "@/component/CommentSection"; // 1. Import the new component

// 2. Define/Update interfaces
interface Author {
  name: string;
}
interface Comment {
  id: string;
  content: string;
  createdAt: string;
  author: Author;
}
interface Post {
  id: string;
  content: string;
  createdAt: string;
  author: Author;
  comments: Comment[]; // Add comments array to Post
}
interface ClassData {
  id: string;
  title: string;
  posts: Post[];
}

export default function StudentStreamPage() {
  const router = useRouter();
  const params = useParams();
  const { classId } = params;

  const [classData, setClassData] = useState<ClassData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchClassData = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token || !classId) return;
    
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

  if (isLoading) return <div className="p-8">Loading stream...</div>;
  if (!classData) return <div className="p-8">Class not found.</div>;

  return (
    <div className="space-y-6">
      {classData.posts.length > 0 ? (
        classData.posts.map(post => (
          <div key={post.id} className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center mb-2">
              <div className="bg-blue-600 text-white rounded-full h-8 w-8 flex items-center justify-center font-bold text-sm">
                {post.author.name.charAt(0)}
              </div>
              <div className="ml-3">
                <p className="font-semibold text-gray-800">{post.author.name}</p>
                <p className="text-xs text-gray-500">{new Date(post.createdAt).toLocaleString()}</p>
              </div>
            </div>
            <p className="text-gray-700 whitespace-pre-wrap">{post.content}</p>
            
            {/* 3. Render the CommentSection component for each post */}
            <CommentSection postId={post.id} initialComments={post.comments} />
          </div>
        ))
      ) : (
        <div className="text-center text-gray-500 p-8 bg-white rounded-lg shadow">
          <p>No announcements from your teacher yet.</p>
        </div>
      )}
    </div>
  );
}