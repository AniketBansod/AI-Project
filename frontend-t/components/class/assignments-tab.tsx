"use client"
import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CreateAssignmentDialog } from "../../components/class/create-assignment-dialog"
import { Badge } from "@/components/ui/badge"
import { Calendar, FileText, Search, X } from "lucide-react"
import { format, isPast } from "date-fns"
import { Input } from "@/components/ui/input"

interface Assignment {
  id: string
  title: string
  description: string
  deadline: string
  points: number
}

interface AssignmentsTabProps {
  classId: string
  assignments: Assignment[]
  isTeacher: boolean
  onUpdate: () => void
}

export function AssignmentsTab({ classId, assignments, isTeacher, onUpdate }: AssignmentsTabProps) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  // Restore saved search query per class
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`assignmentSearch:${classId}`)
      if (saved) setQuery(saved)
    } catch {}
  }, [classId])

  // Debounce query to avoid filtering on every keystroke
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), 250)
    return () => clearTimeout(id)
  }, [query])

  // Persist search query per class with a slight delay
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        localStorage.setItem(`assignmentSearch:${classId}`, query)
      } catch {}
    }, 300)
    return () => clearTimeout(id)
  }, [classId, query])

  const handleAssignmentClick = (assignmentId: string) => {
    if (isTeacher) {
      router.push(`/assignment/${assignmentId}/submissions`)
    } else {
      router.push(`/assignment/${assignmentId}`)
    }
  }

  const filtered = useMemo(() => {
    const q = debouncedQuery.toLowerCase()
    if (!q) return assignments
    return assignments.filter((a) => {
      const t = a.title?.toLowerCase() || ""
      const d = a.description?.toLowerCase() || ""
      return t.includes(q) || d.includes(q)
    })
  }, [assignments, debouncedQuery])

  // Sort by ascending due date (earliest first)
  const sortedAssignments = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const da = new Date(a.deadline).getTime()
      const db = new Date(b.deadline).getTime()
      return da - db
    })
  }, [filtered])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
            <Search className="h-4 w-4" />
          </span>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search assignments..."
            aria-label="Search assignments"
            className="pl-9"
            ref={inputRef}
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery("")
                inputRef.current?.focus()
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {isTeacher && (
          <div className="flex justify-end">
            <CreateAssignmentDialog classId={classId} onAssignmentCreated={onUpdate} />
          </div>
        )}
      </div>

      {assignments.length > 0 && (
        <div className="text-xs text-muted-foreground">
          Showing {filtered.length} of {assignments.length} assignment{assignments.length === 1 ? "" : "s"}
        </div>
      )}

      {assignments.length === 0 ? (
        <Card className="bg-card/50 backdrop-blur-sm">
          <CardContent className="py-16 text-center">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No assignments yet</h3>
            <p className="text-muted-foreground mb-6 text-balance">
              {isTeacher
                ? "Create your first assignment to get started"
                : "Your teacher hasn't created any assignments yet"}
            </p>
            {isTeacher && <CreateAssignmentDialog classId={classId} onAssignmentCreated={onUpdate} />}
          </CardContent>
        </Card>
      ) : sortedAssignments.length === 0 ? (
        <Card className="bg-card/50 backdrop-blur-sm">
          <CardContent className="py-12 text-center">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
              <Search className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold mb-1">No matching assignments</h3>
            <p className="text-muted-foreground text-sm">Try a different search or clear the filter.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sortedAssignments.map((assignment) => {
            const isOverdue = isPast(new Date(assignment.deadline))
            return (
              <Card
                key={assignment.id}
                className="cursor-pointer hover:shadow-lg hover:border-primary/50 transition-all duration-200 bg-card/50 backdrop-blur-sm"
                onClick={() => handleAssignmentClick(assignment.id)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <CardTitle className="text-xl text-balance">{assignment.title}</CardTitle>
                      <CardDescription className="line-clamp-2 text-balance">{assignment.description}</CardDescription>
                    </div>
                    <Badge variant={isOverdue ? "destructive" : "secondary"} className="shrink-0">
                      {assignment.points} pts
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      <span>Due {format(new Date(assignment.deadline), "MMM d, yyyy 'at' h:mm a")}</span>
                    </div>
                    {isOverdue && <Badge variant="destructive">Overdue</Badge>}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
