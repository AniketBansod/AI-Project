"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Navbar } from "../../components/shared/navbar"
import { ClassCard } from "../../components/shared/class-card"
import { ClassCardSkeleton } from "../../components/shared/class-card-skeleton"
import { CreateClassDialog } from "../../components/dashboard/create-class-dialog"
import { JoinClassDialog } from "../../components/dashboard/join-class-dialog"
import { api } from "../../lib/axios"
import { useToast } from "../../hooks/use-toast"

interface Class {
  id: string
  title: string
  teacher: { // ✅ Corrected the interface key to 'teacher'
    name: string
  }
  studentCount?: number
  joinCode?: string
}

export default function DashboardPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [classes, setClasses] = useState<Class[]>([])
  const [userRole, setUserRole] = useState<string>("") // ✅ Changed to string to be more flexible

  useEffect(() => {
    const token = localStorage.getItem("token")
    if (!token) {
      router.push("/login")
      return
    }

    const user = localStorage.getItem("user")
    if (user) {
      const userData = JSON.parse(user)
      setUserRole(userData.role || "") // Ensure it's always a string
    }

    // Pass the role to fetchClasses to avoid stale state issues
    if (user) {
      fetchClasses(JSON.parse(user).role)
    }
    
  }, [router])

  const fetchClasses = async (role: string) => { // ✅ Accept role as a parameter
    setLoading(true)
    try {
      // ✅ Use the role parameter for a reliable, case-insensitive check
      const isTeacher = role?.toUpperCase() === "TEACHER"
      const endpoint = isTeacher ? "/api/classes" : "/api/classes/enrolled"

      const response = await api.get(endpoint)
      setClasses(response.data)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to load classes.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  // ✅ Create a clear boolean for easier use in JSX
  const isTeacher = userRole?.toUpperCase() === "TEACHER"

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            {/* ✅ Use the isTeacher boolean for cleaner conditional rendering */}
            <h1 className="text-3xl font-bold mb-2">{isTeacher ? "Your Classes" : "Enrolled Classes"}</h1>
            <p className="text-muted-foreground text-balance">
              {isTeacher
                ? "Manage your classes and track student progress"
                : "Access your courses and assignments"}
            </p>
          </div>
          {isTeacher ? (
            <CreateClassDialog onClassCreated={() => fetchClasses(userRole)} />
          ) : (
            <JoinClassDialog onClassJoined={() => fetchClasses(userRole)} />
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <ClassCardSkeleton key={i} />
            ))}
          </div>
        ) : classes.length === 0 ? (
          <div className="text-center py-16">
            <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-muted mb-4">
              <svg className="h-10 w-10 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2">No classes yet</h3>
            <p className="text-muted-foreground mb-6 text-balance">
              {isTeacher
                ? "Create your first class to get started"
                : "Join a class using the code from your teacher"}
            </p>
            {isTeacher ? (
              <CreateClassDialog onClassCreated={() => fetchClasses(userRole)} />
            ) : (
              <JoinClassDialog onClassJoined={() => fetchClasses(userRole)} />
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {classes.map((classItem) => (
              <ClassCard key={classItem.id} {...classItem} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

