"use client"

import type React from "react"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { api } from "../../lib/axios"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Plus } from "lucide-react"
import { format } from "date-fns"

interface CreateAssignmentDialogProps {
  classId: string
  onAssignmentCreated: () => void
}

export function CreateAssignmentDialog({ classId, onAssignmentCreated }: CreateAssignmentDialogProps) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    deadline: "",
    points: "",
  })
  // Optional initial resource to attach to the assignment after creation
  const [resTitle, setResTitle] = useState("")
  const [resDesc, setResDesc] = useState("")
  const [resType, setResType] = useState<"ATTACHMENT" | "REFERENCE" | "QUIZ">()
  const [resLink, setResLink] = useState("")
  const [resFile, setResFile] = useState<File | null>(null)
  const deadlineRef = useRef<HTMLInputElement>(null)

  const nowMin = useMemo(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"), [])

  // When dialog opens, if no deadline set, default to +1 hour from now
  useEffect(() => {
    if (open && !formData.deadline) {
      const nextHour = new Date(Date.now() + 60 * 60 * 1000)
      setFormData((p) => ({ ...p, deadline: format(nextHour, "yyyy-MM-dd'T'HH:mm") }))
    }
  }, [open, formData.deadline])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const formEl = e.currentTarget as HTMLFormElement

    // Browser-level validation
    if (!(formEl as any).checkValidity?.()) {
      ;(formEl as any).reportValidity?.()
      return
    }

    const selected = new Date(formData.deadline)
    const now = new Date()
    if (isNaN(selected.getTime()) || selected.getTime() < now.getTime()) {
      toast({
        title: "Invalid deadline",
        description: "Deadline cannot be in the past. Please choose a future date and time.",
        variant: "destructive",
      })
      return
    }

    setLoading(true)

    try {
      const createResp = await api.post(`/api/assignments/${classId}`, {
        ...formData,
        points: Number.parseInt(formData.points),
      })
      const created = createResp.data as { id: string }
      const hasResource = !!resType && (((resTitle?.trim()?.length || 0) > 0) || ((resLink?.trim()?.length || 0) > 0) || !!resFile)
      if (created?.id && hasResource) {
        const fd = new FormData()
        if (resTitle) fd.append("title", resTitle)
        if (resDesc) fd.append("description", resDesc)
        fd.append("type", resType!)
        if (resLink) fd.append("linkUrl", resLink)
        if (resFile) fd.append("file", resFile)
        try {
          await api.post(`/api/assignments/${created.id}/resources`, fd, { headers: { "Content-Type": "multipart/form-data" } })
        } catch (attachErr: any) {
          toast({ title: "Assignment created", description: "But failed to attach the resource.", variant: "destructive" })
        }
      }
      toast({
        title: "Success",
        description: resType ? "Assignment and resource created successfully!" : "Assignment created successfully!",
      })
      setOpen(false)
      setFormData({ title: "", description: "", deadline: "", points: "" })
      setResTitle("")
      setResDesc("")
      setResType(undefined)
      setResLink("")
      setResFile(null)
      onAssignmentCreated()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.response?.data?.message || "Failed to create assignment.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Create Assignment
        </Button>
      </DialogTrigger>
  <DialogContent className="sm:max-w-[560px] md:max-w-[620px] rounded-xl shadow-lg border border-gray-200">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Assignment</DialogTitle>
            <DialogDescription className="text-balance">
              Create a new assignment for your students to complete.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="e.g., Essay on Machine Learning"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Provide detailed instructions for the assignment..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                required
                disabled={loading}
                className="min-h-[100px] resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="deadline">Deadline</Label>
                <Input
                  id="deadline"
                  type="datetime-local"
                  value={formData.deadline}
                  onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                  required
                  disabled={loading}
                  min={nowMin}
                  step={60}
                  ref={deadlineRef}
                />
                <p className="text-xs text-muted-foreground">Local time. Past dates are disabled.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="points">Points</Label>
                <Input
                  id="points"
                  type="number"
                  placeholder="100"
                  value={formData.points}
                  onChange={(e) => setFormData({ ...formData, points: e.target.value })}
                  required
                  disabled={loading}
                  min="1"
                />
              </div>
            </div>
            {/* Optional initial resource, dynamic fields */
            }
            <div className="space-y-2 border-t pt-4 mt-2">
              <Label>Attach resource <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <div className="flex gap-2 items-center">
                <select
                  className="border rounded px-2 py-2 bg-background min-w-[120px]"
                  value={resType || ""}
                  onChange={(e) => setResType(e.target.value as any)}
                  disabled={loading}
                >
                  <option value="">Select type</option>
                  <option value="ATTACHMENT">Attachment</option>
                  <option value="REFERENCE">Reference Link</option>
                  <option value="QUIZ">Quiz/Test Link</option>
                </select>
                <Input
                  placeholder="Resource title (optional)"
                  value={resTitle}
                  onChange={(e) => setResTitle(e.target.value)}
                  disabled={loading || !resType}
                  className="flex-1"
                />
              </div>
              {resType && (
                <>
                  <Textarea
                    placeholder="Resource description (optional)"
                    value={resDesc}
                    onChange={(e) => setResDesc(e.target.value)}
                    disabled={loading}
                    className="min-h-[70px] resize-none mt-2"
                  />
                  {/* Show link input for REFERENCE/QUIZ, file input for ATTACHMENT */}
                  {resType === "REFERENCE" || resType === "QUIZ" ? (
                    <Input
                      placeholder={resType === "QUIZ" ? "Quiz/Test Link URL" : "Reference Link URL"}
                      value={resLink}
                      onChange={(e) => setResLink(e.target.value)}
                      disabled={loading}
                      className="mt-2"
                    />
                  ) : null}
                  {resType === "ATTACHMENT" ? (
                    <Input
                      type="file"
                      onChange={(e) => setResFile(e.target.files?.[0] || null)}
                      disabled={loading}
                      className="mt-2"
                    />
                  ) : null}
                </>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Assignment"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
