"use client"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { api } from "@/lib/axios"
import { Calendar, Loader2, PenLine, Trash2 } from "lucide-react"
import { format } from "date-fns"

interface Assignment {
  id: string
  title: string
  description: string
  deadline: string
  points: number | null
}

interface EditAssignmentDialogProps {
  assignment: Assignment
  onUpdated: () => void
}

export function EditAssignmentDialog({ assignment, onUpdated }: EditAssignmentDialogProps) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [delLoading, setDelLoading] = useState(false)
  const [formData, setFormData] = useState({
    title: assignment.title,
    description: assignment.description,
    deadline: format(new Date(assignment.deadline), "yyyy-MM-dd'T'HH:mm"),
    points: assignment.points?.toString() || "",
  })

  useEffect(() => {
    if (open) {
      setFormData({
        title: assignment.title,
        description: assignment.description,
        deadline: format(new Date(assignment.deadline), "yyyy-MM-dd'T'HH:mm"),
        points: assignment.points?.toString() || "",
      })
    }
  }, [open, assignment])

  const handleSave = async () => {
    setLoading(true)
    try {
      await api.put(`/api/assignments/${assignment.id}`, {
        title: formData.title,
        description: formData.description,
        deadline: formData.deadline,
        points: formData.points ? Number(formData.points) : null,
      })
      toast({ title: "Updated", description: "Assignment updated successfully." })
      setOpen(false)
      onUpdated()
    } catch (e: any) {
      toast({ title: "Failed", description: e.response?.data?.error || "Could not update assignment", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm("Delete this assignment? This cannot be undone.")) return
    setDelLoading(true)
    try {
      await api.delete(`/api/assignments/${assignment.id}`)
      toast({ title: "Deleted", description: "Assignment deleted." })
      setOpen(false)
      onUpdated()
    } catch (e: any) {
      toast({ title: "Failed", description: e.response?.data?.error || "Could not delete assignment", variant: "destructive" })
    } finally {
      setDelLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <PenLine className="h-4 w-4" /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Edit Assignment</DialogTitle>
          <DialogDescription className="text-balance">Update details and deadline. You can also delete the assignment.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="min-h-[100px] resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="deadline">Deadline</Label>
              <Input id="deadline" type="datetime-local" value={formData.deadline} onChange={(e) => setFormData({ ...formData, deadline: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="points">Points</Label>
              <Input id="points" type="number" value={formData.points} onChange={(e) => setFormData({ ...formData, points: e.target.value })} min="1" />
            </div>
          </div>
        </div>
        <DialogFooter className="justify-between">
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={delLoading} className="gap-2">
            {delLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete
          </Button>
          <div className="space-x-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>Cancel</Button>
            <Button onClick={handleSave} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save changes
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
