// src/app/auth/callback/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Authenticating, please wait...");

  useEffect(() => {
    const token = searchParams.get("token");
    const error = searchParams.get("error");

    if (error) {
      setMessage(`Login failed: ${error}. Redirecting...`);
      setTimeout(() => router.push("/login"), 3000);
      return;
    }

    if (token) {
      const fetchUserAndRedirect = async () => {
        try {
          // 1. Save the token
          localStorage.setItem("token", token);
          
          // 2. Use the token to fetch the user's profile
          const res = await fetch("http://localhost:5000/auth/me", {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (!res.ok) throw new Error("Could not fetch user profile.");
          
          const user = await res.json();
          
          // 3. Save the correct user data
          localStorage.setItem("user", JSON.stringify(user));

          // 4. Redirect to the correct dashboard
          if (user.role === "TEACHER") {
            router.push("/dashboard/teacher");
          } else {
            router.push("/dashboard/student");
          }
        } catch (err) {
          setMessage("Authentication failed. Please try again.");
          localStorage.removeItem("token");
          setTimeout(() => router.push("/login"), 3000);
        }
      };

      fetchUserAndRedirect();
    }
  }, [router, searchParams]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p>{message}</p>
      </div>
    </div>
  );
}