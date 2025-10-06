"use client"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CreateAssignmentDialog } from "../../components/class/create-assignment-dialog"
import { Badge } from "@/components/ui/badge"
import { Calendar, FileText } from "lucide-react"
import { format, isPast } from "date-fns"

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

  const handleAssignmentClick = (assignmentId: string) => {
    if (isTeacher) {
      router.push(`/assignment/${assignmentId}/submissions`)
    } else {
      router.push(`/assignment/${assignmentId}`)
    }
  }

  return (
    <div className="space-y-6">
      {isTeacher && (
        <div className="flex justify-end">
          <CreateAssignmentDialog classId={classId} onAssignmentCreated={onUpdate} />
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
      ) : (
        <div className="space-y-4">
          {assignments.map((assignment) => {
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
                  <div className="flex items-center gap-6 text-sm text-muted-foreground">
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
