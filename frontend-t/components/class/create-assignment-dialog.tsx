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
import { Calendar, Loader2, Plus } from "lucide-react"
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

    // Browser-level validation (respects min/max, required, etc.)
    if (!formEl.checkValidity()) {
      ;(formEl as any).reportValidity?.()
      return
    }

    // Additional runtime guard against past deadlines
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
      await api.post(`/api/assignments/${classId}`, {
        ...formData,
        points: Number.parseInt(formData.points),
      })
      toast({
        title: "Success",
        description: "Assignment created successfully!",
      })
      setOpen(false)
      setFormData({ title: "", description: "", deadline: "", points: "" })
      onAssignmentCreated()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to create assignment.",
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
      <DialogContent className="sm:max-w-[550px]">
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
                <div className="relative">
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
                  <button
                    type="button"
                    aria-label="Open date picker"
                    onClick={() => {
                      // Prefer native picker if available
                      ;(deadlineRef.current as any)?.showPicker?.()
                      deadlineRef.current?.focus()
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    disabled={loading}
                  >
                    <Calendar className="h-4 w-4" />
                  </button>
                </div>
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
