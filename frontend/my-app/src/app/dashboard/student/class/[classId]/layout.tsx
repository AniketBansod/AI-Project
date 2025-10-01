// my-app/src/app/dashboard/student/class/[classId]/layout.tsx
"use client";

import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import React from "react";

export default function StudentClassLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const pathname = usePathname();
  const { classId } = params;

  const navLinks = [
    { name: "Stream", href: `/dashboard/student/class/${classId}/stream` },
    { name: "Assignments", href: `/dashboard/student/class/${classId}/assignments` },
    // We can add a "People" tab for students later if desired
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <main className="max-w-7xl mx-auto">
        <div className="border-b-2 pb-4 mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Classroom</h1>
            <nav className="flex space-x-6">
                {navLinks.map((link) => (
                    <Link
                        key={link.name}
                        href={link.href}
                        className={`pb-2 font-semibold ${
                            pathname.startsWith(link.href)
                            ? 'border-b-2 border-blue-600 text-blue-600'
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        {link.name}
                    </Link>
                ))}
            </nav>
        </div>

        <div>{children}</div>
      </main>
    </div>
  );
}