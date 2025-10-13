"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { PlagiarismCheckButton } from "../../components/assignment/plagiarism-check-button"
import { api } from "../../lib/axios"
import { useToast } from "@/hooks/use-toast"
import { Loader2, CheckCircle2 } from "lucide-react"
import { format } from "date-fns"

interface Submission {
  id: string
  content: string
  createdAt: string // ✅ RENAMED from submittedAt
  grade?: number | null
  feedback?: string | null
  student: {
    id: string
    name: string
    email: string
  }
}

interface GradeSubmissionDialogProps {
  submission: Submission
  maxPoints: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onGraded: () => void
}

export function GradeSubmissionDialog({
  submission,
  maxPoints,
  open,
  onOpenChange,
  onGraded,
}: GradeSubmissionDialogProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [grade, setGrade] = useState("")
  const [feedback, setFeedback] = useState("")

  useEffect(() => {
    if (submission) {
      setGrade(submission.grade?.toString() || "")
      setFeedback(submission.feedback || "")
    }
  }, [submission])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      await api.post(`/api/submissions/${submission.id}/grade`, {
        grade: Number.parseInt(grade),
        feedback,
      })
      toast({
        title: "Success",
        description: "Submission graded successfully!",
      })
      onOpenChange(false)
      onGraded()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to grade submission.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const getInitials = (name: string) => {
    if(!name) return ""
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border-2 border-primary/20">
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {getInitials(submission.student.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <div>{submission.student.name}</div>
              <DialogDescription className="text-xs">{submission.student.email}</DialogDescription>
            </div>
          </DialogTitle>
          <div className="flex items-center gap-2 pt-2">
            <Badge variant="secondary" className="text-xs">
              {/* ✅ RENAMED from submission.submittedAt */}
              Submitted {format(new Date(submission.createdAt), "MMM d, yyyy 'at' h:mm a")}
            </Badge>
            {submission.grade !== undefined && (
              <Badge className="gap-1 text-xs">
                <CheckCircle2 className="h-3 w-3" />
                Graded: {submission.grade}/{maxPoints}
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Student Submission</Label>
              {/* This component will now need the full submission object */}
              {/* <PlagiarismCheckButton submission={submission} /> */}
            </div>
            <div className="p-4 rounded-lg bg-muted/50 border border-border">
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-balance">{submission.content}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="grade">Grade (out of {maxPoints})</Label>
              <Input
                id="grade"
                type="number"
                placeholder={`0-${maxPoints}`}
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                required
                disabled={loading}
                min="0"
                max={maxPoints}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="feedback">Feedback</Label>
              <Textarea
                id="feedback"
                placeholder="Provide feedback to the student..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                disabled={loading}
                className="min-h-[120px] resize-none"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {submission.grade !== undefined ? "Update Grade" : "Submit Grade"}
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}

