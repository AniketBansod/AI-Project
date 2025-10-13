"use client"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { api } from "@/lib/axios"
import { Ban, Loader2 } from "lucide-react"

interface RejectSubmissionDialogProps {
  submissionId: string
  onRejected?: () => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function RejectSubmissionDialog({ submissionId, onRejected, open, onOpenChange }: RejectSubmissionDialogProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState("")

  // Support both controlled and uncontrolled usage
  const isControlled = useMemo(() => open !== undefined, [open])
  const [internalOpen, setInternalOpen] = useState(false)
  const actualOpen = isControlled ? (open as boolean) : internalOpen
  const handleOpenChange = (v: boolean) => {
    if (isControlled) {
      onOpenChange?.(v)
    } else {
      setInternalOpen(v)
    }
  }

  const handleReject = async () => {
    if (!note.trim()) {
      toast({ title: "Add a note", description: "Please provide a brief reason for rejection.", variant: "destructive" })
      return
    }
    setLoading(true)
    try {
  await api.post(`/api/submissions/${submissionId}/reject`, { note })
      toast({ title: "Submission rejected", description: "Student will be able to see the reason and resubmit." })
      onRejected?.()
  handleOpenChange(false)
      setNote("")
    } catch (e: any) {
      toast({ title: "Failed", description: e.response?.data?.error || "Could not reject submission", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  return (
  <Dialog open={actualOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm" className="gap-2">
          <Ban className="h-4 w-4" /> Reject
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject submission</DialogTitle>
          <DialogDescription>Share a brief reason; the student will see this and can resubmit.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <label htmlFor="reject-note" className="text-sm font-medium">Reason</label>
          <Textarea id="reject-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Describe the issue found (e.g., high plagiarism, improper citations)" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button onClick={handleReject} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Reject submission
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
