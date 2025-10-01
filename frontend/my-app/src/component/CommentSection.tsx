// my-app/src/components/CommentSection.tsx
"use client";

import { useState, FormEvent } from "react";

interface Author {
  name: string;
}

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  author: Author;
}

interface CommentSectionProps {
  postId: string;
  initialComments: Comment[];
}

export default function CommentSection({ postId, initialComments }: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [newComment, setNewComment] = useState("");

  const handleSubmitComment = async (e: FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem("token");

    try {
      const res = await fetch(`http://localhost:5000/api/comments/${postId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ content: newComment }),
      });
      if (!res.ok) throw new Error("Failed to post comment");

      const createdComment = await res.json();
      setComments([...comments, createdComment]); // Add new comment to the list
      setNewComment(""); // Clear input
    } catch (error) {
      console.error(error);
      alert("Error posting comment.");
    }
  };

  return (
    <div className="mt-4 border-t pt-4">
      {/* List of comments */}
      <div className="space-y-3 mb-4">
        {comments.map(comment => (
          <div key={comment.id} className="flex items-start text-sm">
            <div className="bg-gray-200 text-gray-700 rounded-full h-6 w-6 flex items-center justify-center font-bold text-xs mr-2">
              {comment.author.name.charAt(0)}
            </div>
            <div>
              <span className="font-semibold">{comment.author.name}</span>
              <p className="text-gray-700">{comment.content}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Form to add a new comment */}
      <form onSubmit={handleSubmitComment} className="flex space-x-2">
        <input
          type="text"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a class comment..."
          className="flex-grow p-2 border rounded-md text-sm"
        />
        <button
          type="submit"
          disabled={!newComment.trim()}
          className="bg-gray-600 text-white font-semibold py-2 px-4 rounded text-sm disabled:bg-gray-300"
        >
          Post
        </button>
      </form>
    </div>
  );
}