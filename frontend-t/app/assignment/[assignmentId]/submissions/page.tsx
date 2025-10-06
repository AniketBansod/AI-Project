"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Navbar } from "../../../../components/shared/navbar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { GradeSubmissionDialog } from "../../../../components/assignment/grade-submission-dialog"
import { PlagiarismCheckButton } from "../../../../components/assignment/plagiarism-check-button"
import { api } from "../../../../lib/axios"
import { useToast } from "@/hooks/use-toast"
import { Calendar, FileText, CheckCircle2, Clock, Users } from "lucide-react"
import { format } from "date-fns"

interface Submission {
  id: string
  content: string
  fileUrl?: string
  report?: {
    similarity: number
    aiProbability?: number
    status: "PENDING" | "COMPLETED" | "FAILED"
  }
  createdAt: string
  grade?: number | null // <-- allow null
  feedback?: string | null
  student: {
    id: string
    name: string
    email: string
  }
}

interface AssignmentData {
  id: string
  title: string
  description: string
  deadline: string
  points: number
  class: {
    id: string
    title: string
  }
  submissions: Submission[]
}

export default function SubmissionsPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [assignment, setAssignment] = useState<AssignmentData | null>(null)
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null)

  // fetch function
  const fetchAssignmentData = async () => {
    if (!assignment) setLoading(true)
    try {
      const response = await api.get(`/api/assignments/${params.assignmentId}/submissions`)
      setAssignment(response.data)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to load submissions.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const token = localStorage.getItem("token")
    if (!token) {
      router.push("/login")
      return
    }

    const user = localStorage.getItem("user")
    if (user) {
      const userData = JSON.parse(user)
      if (userData.role?.toUpperCase() !== "TEACHER") {
        router.push("/dashboard")
        return
      }
    } else {
      router.push("/login")
      return
    }

    fetchAssignmentData()
  }, [params.assignmentId, router])

  const getInitials = (name: string) => {
    if (!name) return ""
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 py-8 max-w-6xl">
          <Skeleton className="h-8 w-32 mb-6" />
          <Skeleton className="h-12 w-3/4 mb-4" />
          <Skeleton className="h-96 w-full" />
        </main>
      </div>
    )
  }

  if (!assignment) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center py-16">
            <h2 className="text-2xl font-bold mb-2">Assignment not found</h2>
            <p className="text-muted-foreground mb-6">
              The assignment you're looking for doesn't exist.
            </p>
            <Button onClick={() => router.push("/dashboard")}>
              Back to Dashboard
            </Button>
          </div>
        </main>
      </div>
    )
  }

  const submissions = assignment.submissions || []
  const gradedCount = submissions.filter(
    (s) => s.grade !== undefined && s.grade !== null
  ).length
  const submittedCount = submissions.length

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <Button
          variant="ghost"
          onClick={() => router.push(`/class/${assignment.class.id}`)}
          className="mb-6"
        >
          ← Back to {assignment.class.title}
        </Button>

        <div className="space-y-6">
          <Card className="border-primary/20 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-2xl mb-2 text-balance">
                {assignment.title}
              </CardTitle>
              <CardDescription className="text-base leading-relaxed text-balance">
                {assignment.description}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>
                    Due{" "}
                    {format(
                      new Date(assignment.deadline),
                      "MMM d, yyyy 'at' h:mm a"
                    )}
                  </span>
                </div>
                <Badge variant="secondary">{assignment.points} pts</Badge>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>
                    {submittedCount} submissions • {gradedCount} graded
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Student Submissions</h2>
              <Button size="sm" variant="outline" onClick={fetchAssignmentData}>
                Refresh
              </Button>
            </div>

            {submissions.length === 0 ? (
              <Card className="bg-card/50 backdrop-blur-sm">
                <CardContent className="py-16 text-center">
                  <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No submissions yet</h3>
                  <p className="text-muted-foreground text-balance">
                    Students haven't submitted their work yet
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {submissions.map((submission) => (
                  <Card
                    key={submission.id}
                    className="bg-card/50 backdrop-blur-sm"
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4 flex-1">
                          <Avatar className="h-12 w-12 border-2 border-primary/20">
                            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                              {getInitials(submission.student.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 space-y-1">
                            <CardTitle className="text-lg">
                              {submission.student.name}
                            </CardTitle>
                            <CardDescription>
                              {submission.student.email}
                            </CardDescription>
                            {submission.fileUrl && (
                              <a
                                href={submission.fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-primary hover:underline flex items-center gap-1 pt-1"
                              >
                                <FileText className="h-4 w-4" />
                                View Submitted File
                              </a>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-2 shrink-0">
                          {submission.grade !== undefined &&
                          submission.grade !== null ? (
                            <Badge className="gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              {submission.grade}/{assignment.points}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1">
                              <Clock className="h-3 w-3" />
                              Not graded
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {format(
                              new Date(submission.createdAt),
                              "MMM d, h:mm a"
                            )}
                          </span>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-center gap-3">
                        <PlagiarismCheckButton submission={submission} />
                        {/* Grade button per submission */}
                        <Button
                          size="sm"
                          onClick={() => setSelectedSubmission(submission)}
                        >
                          {submission.grade !== undefined &&
                          submission.grade !== null
                            ? "Edit Grade"
                            : "Grade"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        {selectedSubmission && (
          <GradeSubmissionDialog
            submission={selectedSubmission}
            maxPoints={assignment.points}
            open={!!selectedSubmission}
            onOpenChange={(open) => !open && setSelectedSubmission(null)}
            onGraded={fetchAssignmentData}
          />
        )}
      </main>
    </div>
  )
}
