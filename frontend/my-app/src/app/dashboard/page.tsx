"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Dashboard() {
  const router = useRouter();

  useEffect(() => {
    const user = localStorage.getItem("user");
    if (!user) {
      router.push("/login");
      return;
    }
    
    try {
      const { role } = JSON.parse(user);
      // Handle both "TEACHER"/"STUDENT" and "teacher"/"student" cases
      const normalizedRole = role.toLowerCase();
      if (normalizedRole === "teacher") {
        router.push("/dashboard/teacher");
      } else if (normalizedRole === "student") {
        router.push("/dashboard/student");
      } else {
        console.error("Invalid role:", role);
        router.push("/login");
      }
    } catch (error) {
      console.error("Error parsing user data:", error);
      router.push("/login");
    }
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p>Loading dashboard...</p>
      </div>
    </div>
  );
}
