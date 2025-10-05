// my-app/src/app/dashboard/teacher/class/[classId]/layout.tsx
"use client"; // Needs to be a client component to get params

import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import React from "react";

export default function ClassLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const pathname = usePathname();
  const { classId } = params;

  const navLinks = [
    { name: "Stream", href: `/dashboard/teacher/class/${classId}/stream` },
    { name: "Assignments", href: `/dashboard/teacher/class/${classId}/assignments` },
    { name: "People", href: `/dashboard/teacher/class/${classId}/people` },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <main className="max-w-7xl mx-auto">
        {/* Header and Navigation Tabs */}
        <div className="border-b-2 pb-4 mb-6">
            {/* You can add a dynamic header here later to show class name */}
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Class Management</h1>
            <nav className="flex space-x-6">
                {navLinks.map((link) => (
                    <Link
                        key={link.name}
                        href={link.href}
                        className={`pb-2 font-semibold ${
                            pathname === link.href
                            ? 'border-b-2 border-blue-600 text-blue-600'
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        {link.name}
                    </Link>
                ))}
            </nav>
        </div>

        {/* Page content will be rendered here */}
        <div>{children}</div>
      </main>
    </div>
  );
}