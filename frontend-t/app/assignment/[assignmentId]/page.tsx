"use client"

import type React from "react"
import { useEffect, useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { Navbar } from "../../../components/shared/navbar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { api } from "../../../lib/axios"
import { useToast } from "@/hooks/use-toast"
import { Calendar, FileText, Loader2, CheckCircle2, Clock, Upload, X, RotateCcw } from "lucide-react"
import { format, isPast } from "date-fns"

// Define the structure of your assignment and submission data
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
  submission?: {
    id: string
    fileUrl: string
    submittedAt: string
    grade?: number
    feedback?: string
  }
}

export default function AssignmentPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  
  // State management for loading, data, and UI interaction
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [assignment, setAssignment] = useState<AssignmentData | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  
  // A ref for the hidden file input to trigger it programmatically
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch the assignment data when the component mounts or assignmentId changes
  useEffect(() => {
    const token = localStorage.getItem("token")
    if (!token) {
      router.push("/login")
      return
    }
    fetchAssignment()
  }, [params.assignmentId, router])

  // Function to fetch assignment details from the backend
  const fetchAssignment = async () => {
    setLoading(true)
    try {
      const response = await api.get(`/api/assignments/${params.assignmentId}`)
      setAssignment(response.data)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to load assignment.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  // Handle file selection from the input
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0])
    }
  }

  // Handle the form submission (uploading the file)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedFile) return

    setIsSubmitting(true)
    const formData = new FormData()
    formData.append("file", selectedFile)

    try {
      await api.post(`/api/submissions/${params.assignmentId}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      toast({
        title: "Success",
        description: "Your work has been submitted!",
      })
      setSelectedFile(null)
      fetchAssignment() // Refresh data to show the new submission
    } catch (error: any) {
      toast({
        title: "Submission Failed",
        description: error.response?.data?.message || "Could not upload the file.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle the "Unsubmit" action after confirmation
  const handleUnsubmit = async () => {
    setIsSubmitting(true)
    try {
      await api.delete(`/api/submissions/${params.assignmentId}`)
      toast({
        title: "Submission Retracted",
        description: "You can now submit a new version.",
      })
      fetchAssignment() // Refresh data to show the empty submission slot
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to unsubmit.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Display a loading skeleton while fetching data
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 py-8 max-w-4xl">
          <Skeleton className="h-8 w-32 mb-6" />
          <Skeleton className="h-12 w-3/4 mb-4" />
          <Skeleton className="h-96 w-full" />
        </main>
      </div>
    )
  }

  // Handle the case where the assignment is not found
  if (!assignment) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center py-16">
            <h2 className="text-2xl font-bold mb-2">Assignment not found</h2>
            <p className="text-muted-foreground mb-6">The assignment you're looking for doesn't exist.</p>
            <Button onClick={() => router.push("/dashboard")}>Back to Dashboard</Button>
          </div>
        </main>
      </div>
    )
  }

  // Determine the current state for conditional rendering
  const isOverdue = isPast(new Date(assignment.deadline))
  const hasSubmission = !!assignment.submission
  const isGraded = hasSubmission && assignment.submission?.grade !== undefined

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <Button variant="ghost" onClick={() => router.push(`/class/${assignment.class.id}`)} className="mb-6">
          ← Back to {assignment.class.title}
        </Button>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Left Column: Assignment Details */}
          <div className="md:col-span-2 space-y-6">
            <Card className="border-primary/20 bg-card/50 backdrop-blur-sm">
              <CardHeader>
                 <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex-1">
                      <CardTitle className="text-2xl mb-2 text-balance">{assignment.title}</CardTitle>
                    </div>
                    <Badge variant={isOverdue ? "destructive" : "secondary"} className="text-lg px-3 py-1 shrink-0">
                      {assignment.points} pts
                    </Badge>
                  </div>
              </CardHeader>
               <CardContent>
                  <CardDescription className="text-base leading-relaxed text-balance mb-4">
                    {assignment.description}
                  </CardDescription>
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>Due {format(new Date(assignment.deadline), "MMM d, yyyy 'at' h:mm a")}</span>
                    </div>
                  </div>
               </CardContent>
            </Card>
            
            {isGraded && assignment.submission?.feedback && (
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Teacher Feedback
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-balance">{assignment.submission.feedback}</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column: Submission Card */}
          <div className="md:col-span-1">
            <Card className="bg-card/50 backdrop-blur-sm shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Your Work
                  {hasSubmission && !isGraded && (
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                      Submitted
                    </Badge>
                  )}
                  {isGraded && (
                     <Badge className="gap-1">
                        Graded: {assignment.submission?.grade}/{assignment.points}
                     </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* --- THIS IS THE CORE LOGIC FOR THE SUBMISSION UI --- */}

                {/* State 1: Already submitted */}
                {hasSubmission ? (
                  <div className="space-y-4">
                    <a 
                      href={assignment.submission!.fileUrl} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="w-full"
                    >
                      <Button variant="outline" className="w-full justify-between">
                        <span className="truncate pr-2">{assignment.submission!.fileUrl.split('/').pop()}</span>
                        <FileText className="h-4 w-4 shrink-0" />
                      </Button>
                    </a>
                    {!isGraded && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="destructive"
                            className="w-full"
                            disabled={isSubmitting}
                          >
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                            Unsubmit
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure you want to unsubmit?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will remove your current submission. You'll need to re-submit your work before the deadline.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleUnsubmit}>
                              Yes, Unsubmit
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    {isGraded && (
                        <p className="text-sm text-center text-muted-foreground pt-2">
                            This assignment has been graded.
                        </p>
                    )}
                  </div>
                ) : (
                  /* State 2: Not yet submitted */
                  <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Display the selected file or the upload button */}
                    {selectedFile ? (
                      <div className="flex items-center justify-between rounded-md border border-input p-2 bg-muted/50">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                          <span className="truncate text-sm">{selectedFile.name}</span>
                        </div>
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 shrink-0"
                          onClick={() => setSelectedFile(null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                       <Button 
                         type="button" 
                         variant="outline" 
                         className="w-full"
                         onClick={() => fileInputRef.current?.click()}
                       >
                         <Upload className="mr-2 h-4 w-4" />
                         Add or create
                       </Button>
                    )}
                    
                    {/* Hidden file input */}
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      className="hidden"
                    />

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={isSubmitting || !selectedFile}
                    >
                      {isSubmitting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                      )}
                      Turn In
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}

