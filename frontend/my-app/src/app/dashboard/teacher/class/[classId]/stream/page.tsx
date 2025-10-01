// my-app/src/app/dashboard/teacher/class/[classId]/stream/page.tsx
"use client";
import { useEffect, useState, FormEvent, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import CommentSection from "@/component/CommentSection"; // 1. Import the new component

// Define interfaces for our data
interface Author { name: string; }
interface Comment { id: string; content: string; createdAt: string; author: Author; }
interface Post { id: string; content: string; createdAt: string; author: Author; comments: Comment[]; }
interface ClassData { id: string; title: string; posts: Post[]; }

export default function StreamPage() {
  const router = useRouter();
  const params = useParams();
  const { classId } = params;
  const [classData, setClassData] = useState<ClassData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [newPostContent, setNewPostContent] = useState("");

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
    } catch (error) { console.error(error);
    } finally { setIsLoading(false); }
  }, [classId]);

  useEffect(() => { fetchClassData(); }, [fetchClassData]);

  const handleCreatePost = async (e: FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`http://localhost:5000/api/posts/${classId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ content: newPostContent }),
      });
      if (!res.ok) throw new Error("Failed to create post");
      setNewPostContent("");
      await fetchClassData();
    } catch (error) { console.error(error); alert("Failed to create post."); }
  };

  if (isLoading) return <div className="p-8">Loading stream...</div>;
  if (!classData) return <div className="p-8">Class not found.</div>;

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-lg shadow">
        <form onSubmit={handleCreatePost}>
          <textarea
            value={newPostContent}
            onChange={(e) => setNewPostContent(e.target.value)}
            placeholder="Announce something to your class..."
            className="w-full p-2 border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            rows={3}
          />
          <div className="text-right mt-2">
            <button type="submit" disabled={!newPostContent.trim()} className="bg-blue-600 text-white font-semibold py-2 px-4 rounded disabled:bg-gray-300">
              Post
            </button>
          </div>
        </form>
      </div>
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
              <CommentSection postId={post.id} initialComments={post.comments} />
          </div>
        ))
      ) : (
        <div className="text-center text-gray-500 p-8 bg-white rounded-lg shadow">
          <p>This is where you can talk to your class. Use the stream to share announcements.</p>
        </div>
      )}
    </div>
  );
}