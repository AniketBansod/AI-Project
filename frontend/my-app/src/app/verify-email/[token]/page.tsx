// src/app/verify-email/[token]/page.tsx

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

export default function VerifyEmailPage() {
  const [status, setStatus] = useState<"verifying" | "success" | "error">(
    "verifying"
  );
  const [message, setMessage] = useState("Verifying your email...");
  const params = useParams();
  const { token } = params;

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("No verification token found.");
      return;
    }

    const verify = async () => {
      try {
        const res = await fetch(
          `http://localhost:5000/auth/verify-email/${token}`
        );
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Verification failed.");
        }

        setStatus("success");
        setMessage("Email verified successfully! You can now log in.");
      } catch (err: any) {
        setStatus("error");
        setMessage(err.message);
      }
    };

    verify();
  }, [token]);

  const renderStatus = () => {
    switch (status) {
      case "verifying":
        return (
          <>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600">{message}</p>
          </>
        );
      case "success":
        return (
          <>
            <h1 className="text-2xl font-bold text-green-600 mb-4">✅ Success!</h1>
            <p className="text-gray-700 mb-6">{message}</p>
            <Link
              href="/login"
              className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
            >
              Go to Login
            </Link>
          </>
        );
      case "error":
        return (
          <>
            <h1 className="text-2xl font-bold text-red-600 mb-4">❌ Error</h1>
            <p className="text-gray-700">{message}</p>
          </>
        );
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md text-center max-w-md w-full">
        {renderStatus()}
      </div>
    </div>
  );
}