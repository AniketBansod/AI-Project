"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Navbar } from "@/components/shared/navbar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { StreamTab } from "../../../components/class/stream-tab"
import { AssignmentsTab } from "../../../components/class/assignments-tab"
import { PeopleTab } from "../../../components/class/people-tab"
import { api } from "../../../lib/axios"
import { useToast } from "@/hooks/use-toast"
import { Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ClassData {
  id: string
  title: string
  joinCode: string
  teacher: {
    id: string
    name: string
    email: string
  }
  students: Array<{
    id: string
    name: string
    email: string
  }>
  posts: Array<{
    id: string
    content: string
    author: {
      name: string
    }
    createdAt: string
    comments: Array<{
      id: string
      content: string
      author: {
        name: string
      }
      createdAt: string
    }>
  }>
  assignments: Array<{
    id: string
    title: string
    description: string
    deadline: string
    points: number
  }>
}

export default function ClassPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [classData, setClassData] = useState<ClassData | null>(null)
  const [userRole, setUserRole] = useState("") // Use a simple string
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState<string>("stream")

  useEffect(() => {
    const token = localStorage.getItem("token")
    if (!token) {
      router.push("/login")
      return
    }

    const user = localStorage.getItem("user")
    let teacher = false
    if (user) {
      const userData = JSON.parse(user)
      setUserRole(userData.role)
      teacher = (userData.role || "").toUpperCase() === "TEACHER"
    }

    // Restore last selected tab for this class, or default to assignments for teachers
    const savedTab = localStorage.getItem(`classTab:${params.classId}`)
    if (savedTab === "stream" || savedTab === "assignments" || savedTab === "people") {
      setTab(savedTab)
    } else {
      // If teacher and no saved tab, default to assignments for better UX
      setTab(teacher ? "assignments" : "stream")
    }

    fetchClassData()
  }, [params.classId, router])

  const fetchClassData = async () => {
    setLoading(true)
    try {
      const response = await api.get(`/api/classes/${params.classId}`)
      setClassData(response.data)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to load class data.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const copyJoinCode = () => {
    if (classData?.joinCode) {
      navigator.clipboard.writeText(classData.joinCode)
      setCopied(true)
      toast({
        title: "Copied!",
        description: "Join code copied to clipboard.",
      })
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // ✅ Create a robust, case-insensitive boolean for the role
  const isTeacher = userRole?.toUpperCase() === "TEACHER"

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <div className="space-y-4 mb-8">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-6 w-32" />
          </div>
          <Skeleton className="h-12 w-full mb-6" />
          <Skeleton className="h-96 w-full" />
        </main>
      </div>
    )
  }

  if (!classData) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center py-16">
            <h2 className="text-2xl font-bold mb-2">Class not found</h2>
            <p className="text-muted-foreground mb-6">The class you're looking for doesn't exist.</p>
            <Button onClick={() => router.push("/dashboard")}>Back to Dashboard</Button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold mb-3 text-balance">{classData.title}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="font-mono text-sm px-3 py-1">
              {classData.joinCode}
            </Badge>
            <Button variant="ghost" size="sm" onClick={copyJoinCode} className="h-8 w-8 p-0">
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => { setTab(v); localStorage.setItem(`classTab:${params.classId}`, v) }} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-3 mb-8">
            <TabsTrigger value="stream">Stream</TabsTrigger>
            <TabsTrigger value="assignments">Assignments</TabsTrigger>
            <TabsTrigger value="people">People</TabsTrigger>
          </TabsList>

          {/* ✅ Pass the reliable 'isTeacher' boolean to all child tabs */}
          <TabsContent value="stream" className="space-y-6">
            <StreamTab
              classId={classData.id}
              posts={classData.posts}
              isTeacher={isTeacher}
              onUpdate={fetchClassData}
            />
          </TabsContent>

          <TabsContent value="assignments" className="space-y-6">
            <AssignmentsTab
              classId={classData.id}
              assignments={classData.assignments}
              isTeacher={isTeacher}
              onUpdate={fetchClassData}
            />
          </TabsContent>

          <TabsContent value="people" className="space-y-6">
            <PeopleTab
              classId={classData.id}
              teacher={classData.teacher}
              students={classData.students}
              isTeacher={isTeacher}
              onUpdate={fetchClassData}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
