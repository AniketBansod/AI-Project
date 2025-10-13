"use client"

import type React from "react"
import { useEffect, useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { Navbar } from "../../../components/shared/navbar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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
import { Calendar, FileText, Loader2, CheckCircle2, Clock, Upload, X, RotateCcw, Ban } from "lucide-react"
import { format, isPast } from "date-fns"
import { formatApiError } from "@/lib/errors"
import { AppError } from "@/components/shared/app-error"

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
  resources?: Array<{
    id: string
    title: string
    description?: string
    type: "ATTACHMENT" | "REFERENCE" | "QUIZ"
    linkUrl?: string
    fileUrl?: string
    createdAt: string
  }>
  submission?: {
    id: string
    fileUrl: string
    createdAt?: string
    grade?: number | null
    feedback?: string | null
    status?: "SUBMITTED" | "REJECTED" | "GRADED"
    rejectionNote?: string | null
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
  const [errorState, setErrorState] = useState<{ title: string; message: string } | null>(null)
  const [resources, setResources] = useState<AssignmentData["resources"]>([])
  const [isTeacher, setIsTeacher] = useState(false)
  const [resOpen, setResOpen] = useState(false)
  const [resTitle, setResTitle] = useState("")
  const [resDesc, setResDesc] = useState("")
  const [resType, setResType] = useState<"ATTACHMENT" | "REFERENCE" | "QUIZ">("ATTACHMENT")
  const [resLink, setResLink] = useState("")
  const [resFile, setResFile] = useState<File | null>(null)
  const [resSubmitting, setResSubmitting] = useState(false)
  
  // A ref for the hidden file input to trigger it programmatically
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch the assignment data when the component mounts or assignmentId changes
  useEffect(() => {
    const token = localStorage.getItem("token")
    if (!token) {
      router.push("/login")
      return
    }
    const userStr = localStorage.getItem("user")
    if (userStr) {
      const u = JSON.parse(userStr)
      setIsTeacher((u.role || "").toUpperCase() === "TEACHER")
    }
    fetchAssignment()
  }, [params.assignmentId, router])

  // Function to fetch assignment details from the backend
  const fetchAssignment = async () => {
    setLoading(true)
    try {
      const response = await api.get(`/api/assignments/${params.assignmentId}`)
      setAssignment(response.data)
      try {
        const list = await api.get(`/api/assignments/${params.assignmentId}/resources`)
        setResources(list.data || [])
      } catch {}
      setErrorState(null)
    } catch (error: any) {
      const fe = formatApiError(error, "Failed to load assignment.")
      setErrorState({ title: fe.title, message: fe.message })
      toast({ title: fe.title, description: fe.message, variant: "destructive" })
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
      const fe = formatApiError(error, "Could not upload the file.")
      toast({ title: fe.title, description: fe.message, variant: "destructive" })
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
      const fe = formatApiError(error, "Failed to unsubmit.")
      toast({ title: fe.title, description: fe.message, variant: "destructive" })
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
        <main className="container mx-auto px-4 py-8 max-w-3xl">
          <AppError title={errorState?.title || "Assignment not found"} message={errorState?.message || "The assignment you're looking for doesn't exist or couldn't be loaded."} />
          <div className="mt-6">
            <Button onClick={() => router.push("/dashboard")}>Back to Dashboard</Button>
          </div>
        </main>
      </div>
    )
  }

  // Determine the current state for conditional rendering
  const isOverdue = isPast(new Date(assignment.deadline))
  const hasSubmission = !!assignment.submission
  const isGraded =
    hasSubmission &&
    assignment.submission?.grade !== undefined &&
    assignment.submission?.grade !== null
  const isRejected = hasSubmission && assignment.submission?.status === "REJECTED"

  const submitResource = async () => {
    setResSubmitting(true)
    try {
      const form = new FormData()
      form.append("title", resTitle)
      if (resDesc) form.append("description", resDesc)
      form.append("type", resType)
      if (resLink) form.append("linkUrl", resLink)
      if (resFile) form.append("file", resFile)
      await api.post(`/api/assignments/${params.assignmentId}/resources`, form, { headers: { "Content-Type": "multipart/form-data" } })
      setResOpen(false)
      setResTitle("")
      setResDesc("")
      setResType("ATTACHMENT")
      setResLink("")
      setResFile(null)
      const list = await api.get(`/api/assignments/${params.assignmentId}/resources`)
      setResources(list.data || [])
      toast({ title: "Resource added" })
    } catch (e: any) {
      toast({ title: "Error", description: e?.response?.data?.error || "Failed to add resource", variant: "destructive" })
    } finally {
      setResSubmitting(false)
    }
  }

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
            {/* Rejection notice */}
            {hasSubmission && isRejected && (
              <Card className="border-destructive/30 bg-destructive/5">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2 text-destructive">
                    <Ban className="h-5 w-5" /> Submission Rejected
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-balance mb-2">Your teacher rejected this submission. Please review the note and resubmit.</p>
                  {assignment.submission?.rejectionNote && (
                    <div className="rounded-md bg-destructive/10 p-3 text-sm">
                      <span className="font-medium">Teacher note: </span>
                      {assignment.submission.rejectionNote}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">Tip: Unsubmit to remove the rejected file, then upload a corrected document before the deadline.</p>
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

            {/* Assignment resources */}
            <Card className="bg-card/50 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Resources</CardTitle>
                {isTeacher && (
                  <Dialog open={resOpen} onOpenChange={setResOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm">Add resource</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add assignment resource</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-3">
                        <Input placeholder="Title" value={resTitle} onChange={(e) => setResTitle(e.target.value)} />
                        <Textarea placeholder="Description (optional)" value={resDesc} onChange={(e) => setResDesc(e.target.value)} />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <select className="border rounded px-2 py-2 bg-background" value={resType} onChange={(e) => setResType(e.target.value as any)}>
                            <option value="ATTACHMENT">Attachment</option>
                            <option value="REFERENCE">Reference</option>
                            <option value="QUIZ">Quiz</option>
                          </select>
                          <Input placeholder="Link URL (optional)" value={resLink} onChange={(e) => setResLink(e.target.value)} />
                        </div>
                        <div className="flex items-center gap-2">
                          <Input type="file" onChange={(e) => setResFile(e.target.files?.[0] || null)} />
                        </div>
                        <div className="flex justify-end">
                          <Button onClick={submitResource} disabled={!resTitle || resSubmitting}>
                            {resSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </CardHeader>
              <CardContent>
                {resources && resources.length > 0 ? (
                  <div className="space-y-2">
                    {resources.map((r) => (
                      <div key={r.id} className="flex items-center justify-between rounded border p-3">
                        <div>
                          <div className="font-medium">{r.title}</div>
                          {r.description ? <div className="text-xs text-muted-foreground">{r.description}</div> : null}
                          <div className="text-xs text-muted-foreground">{r.type}{r.linkUrl ? ` • ${r.linkUrl}` : ""}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {r.linkUrl ? (
                            <Button size="sm" variant="outline" onClick={() => window.open(r.linkUrl!, "_blank")}>Open</Button>
                          ) : null}
                          {r.fileUrl ? (
                            <Button size="sm" variant="outline" onClick={() => window.open(r.fileUrl!, "_blank")}>Download</Button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No resources attached.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}

