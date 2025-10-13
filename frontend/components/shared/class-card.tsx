"use client"

import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BookOpen, Users } from "lucide-react"
import { User } from "lucide-react" // Declaring the User variable

interface ClassCardProps {
  id: string
  title: string
  teacher: {
    name: string
  }
  studentCount?: number
  joinCode?: string
}

export function ClassCard({ id, title, teacher, studentCount, joinCode }: ClassCardProps) {
  const router = useRouter()

  return (
    <Card
      className="cursor-pointer hover:shadow-lg hover:border-primary/50 transition-all duration-200 group bg-card/50 backdrop-blur-sm"
      onClick={() => router.push(`/class/${id}`)}
    >
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between">
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <BookOpen className="h-6 w-6 text-primary" />
          </div>
          {joinCode && (
            <Badge variant="secondary" className="font-mono text-xs">
              {joinCode}
            </Badge>
          )}
        </div>
        <CardTitle className="text-xl group-hover:text-primary transition-colors text-balance">{title}</CardTitle>
        <CardDescription className="flex items-center gap-2">
          <User className="h-4 w-4" />
          <span className="text-balance">Teacher: {teacher.name}</span>
        </CardDescription>
      </CardHeader>
      {studentCount !== undefined && (
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>{studentCount} students enrolled</span>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
