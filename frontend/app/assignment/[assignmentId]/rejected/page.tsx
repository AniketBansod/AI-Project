"use client"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Navbar } from "../../../../components/shared/navbar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { api } from "@/lib/axios"
import { useToast } from "@/hooks/use-toast"

interface RejectedItem {
  id: string
  rejectionNote?: string | null
  student: { id: string; name: string; email: string }
  fileUrl?: string | null
  rejectedAt?: string
}

export default function RejectedSubmissionsPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<RejectedItem[]>([])

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/api/assignments/${params.assignmentId}/rejected`)
      setItems(res.data.rejected || [])
    } catch (e: any) {
      toast({ title: "Error", description: e.response?.data?.error || "Failed to load rejected submissions", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const token = localStorage.getItem("token")
    if (!token) {
      router.push("/login")
      return
    }
    fetchData()
  }, [params.assignmentId, router])

  const getInitials = (name: string) => (name || "").split(" ").map(n => n[0]).join("").toUpperCase().slice(0,2)

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-5xl">
        <Button variant="ghost" onClick={() => router.push(`/assignment/${params.assignmentId}/submissions`)} className="mb-6">← Back to Submissions</Button>
        <h1 className="text-2xl font-bold mb-4">Rejected Submissions</h1>
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : items.length === 0 ? (
          <Card className="bg-card/50 backdrop-blur-sm">
            <CardContent className="py-12 text-center text-muted-foreground">No rejected submissions</CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {items.map((s) => (
              <Card key={s.id} className="bg-card/50 backdrop-blur-sm">
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <Avatar className="h-10 w-10 border-2 border-primary/20">
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold">{getInitials(s.student.name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <CardTitle className="text-base">{s.student.name}</CardTitle>
                      <div className="text-sm text-muted-foreground">{s.student.email}</div>
                      {s.rejectionNote && <div className="text-sm mt-2"><span className="font-medium">Note:</span> {s.rejectionNote}</div>}
                    </div>
                    <Badge variant="destructive">Rejected</Badge>
                  </div>
                </CardHeader>
                {s.fileUrl && (
                  <CardContent>
                    <a className="text-sm text-primary hover:underline" href={s.fileUrl} target="_blank" rel="noopener noreferrer">View File</a>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
