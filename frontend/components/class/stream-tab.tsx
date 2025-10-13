"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { api } from "@/lib/axios"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Send, Link2, Paperclip, FileText, Trash2 } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import useSWR from "swr"

type MaterialType = "NOTE" | "REFERENCE" | "QUIZ"

interface ClassMaterial {
  id: string
  title: string
  description?: string
  type: MaterialType
  linkUrl?: string
  fileUrl?: string
  createdAt: string
}

interface Post {
  id: string
  content: string
  author: {
    name: string
  }
  createdAt: string
  comments: Array<{
    id: string
    content: string
    author: {
      name: string
    }
    createdAt: string
  }>
}

interface StreamTabProps {
  classId: string
  posts: Post[]
  isTeacher: boolean
  onUpdate: () => void
}

export function StreamTab({ classId, posts, isTeacher, onUpdate }: StreamTabProps) {
  const { toast } = useToast()
  const [postContent, setPostContent] = useState("")
  const [postLoading, setPostLoading] = useState(false)
  const [commentContent, setCommentContent] = useState<{ [key: string]: string }>({})
  const [commentLoading, setCommentLoading] = useState<{ [key: string]: boolean }>({})
  const fetcher = (url: string) => api.get(url).then((r) => r.data)
  const { data: materials, isLoading: materialsLoading, mutate: mutateMaterials } = useSWR<ClassMaterial[]>(
    `/api/classes/${classId}/materials`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  )
  const [matOpen, setMatOpen] = useState(false)
  const [matTitle, setMatTitle] = useState("")
  const [matDesc, setMatDesc] = useState("")
  const [matType, setMatType] = useState<MaterialType>("NOTE")
  const [matLink, setMatLink] = useState("")
  const [matFile, setMatFile] = useState<File | null>(null)
  const [matSubmitting, setMatSubmitting] = useState(false)

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault()
    setPostLoading(true)

    try {
      await api.post(`/api/posts/${classId}`, { content: postContent })
      toast({
        title: "Success",
        description: "Post created successfully!",
      })
      setPostContent("")
      onUpdate()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to create post.",
        variant: "destructive",
      })
    } finally {
      setPostLoading(false)
    }
  }

  // Delete a material (teacher only)
  const deleteMaterial = async (materialId: string) => {
    try {
      await api.delete(`/api/classes/${classId}/materials/${materialId}`)
      await mutateMaterials()
      toast({ title: "Material deleted" })
    } catch (e: any) {
      toast({ title: "Error", description: e?.response?.data?.error || "Failed to delete material", variant: "destructive" })
    }
  }

  const submitMaterial = async () => {
    setMatSubmitting(true)
    try {
      const form = new FormData()
      form.append("title", matTitle)
      if (matDesc) form.append("description", matDesc)
      form.append("type", matType)
      if (matLink) form.append("linkUrl", matLink)
      if (matFile) form.append("file", matFile)
      await api.post(`/api/classes/${classId}/materials`, form, { headers: { "Content-Type": "multipart/form-data" } })
      setMatOpen(false)
      setMatTitle("")
      setMatDesc("")
      setMatLink("")
      setMatType("NOTE")
      setMatFile(null)
      await mutateMaterials()
      toast({ title: "Material added" })
    } catch (e: any) {
      toast({ title: "Error", description: e?.response?.data?.error || "Failed to add material", variant: "destructive" })
    } finally {
      setMatSubmitting(false)
    }
  }

  const handleAddComment = async (postId: string) => {
    const content = commentContent[postId]
    if (!content?.trim()) return

    setCommentLoading({ ...commentLoading, [postId]: true })

    try {
      await api.post(`/api/comments/${postId}`, { content })
      toast({
        title: "Success",
        description: "Comment added successfully!",
      })
      setCommentContent({ ...commentContent, [postId]: "" })
      onUpdate()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to add comment.",
        variant: "destructive",
      })
    } finally {
      setCommentLoading({ ...commentLoading, [postId]: false })
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <div className="space-y-6">
      {/* Materials section */}
      <Card className="bg-card/50 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="font-semibold">Class materials</div>
          {isTeacher && (
            <Dialog open={matOpen} onOpenChange={setMatOpen}>
              <DialogTrigger asChild>
                <Button size="sm">Add material</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[420px]">
                <DialogHeader>
                  <DialogTitle>Add class material</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <Input placeholder="Title" value={matTitle} onChange={(e) => setMatTitle(e.target.value)} />
                  <Textarea placeholder="Description (optional)" value={matDesc} onChange={(e) => setMatDesc(e.target.value)} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <select className="border rounded px-2 py-2 bg-background" value={matType} onChange={(e) => setMatType(e.target.value as MaterialType)}>
                      <option value="NOTE">Note</option>
                      <option value="REFERENCE">Reference</option>
                      <option value="QUIZ">Quiz</option>
                    </select>
                    {(matType === "REFERENCE" || matType === "QUIZ") ? (
                      <Input placeholder={matType === "QUIZ" ? "Quiz/Test Link URL" : "Reference Link URL"} value={matLink} onChange={(e) => setMatLink(e.target.value)} />
                    ) : (
                      <div className="text-xs text-muted-foreground self-center">Optional link</div>
                    )}
                  </div>
                  {matType === "NOTE" || matType === "REFERENCE" ? (
                    <div className="flex items-center gap-2">
                      <Input type="file" onChange={(e) => setMatFile(e.target.files?.[0] || null)} />
                    </div>
                  ) : null}
                  <div className="flex justify-end">
                    <Button onClick={submitMaterial} disabled={!matTitle || matSubmitting}>
                      {matSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {materialsLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse rounded-lg border border-border bg-muted/60 p-4">
                  <div className="h-4 w-1/3 bg-muted rounded" />
                  <div className="mt-2 h-3 w-2/3 bg-muted/70 rounded" />
                </div>
              ))}
            </div>
          ) : !materials || materials.length === 0 ? (
            <p className="text-sm text-muted-foreground">No materials yet.</p>
          ) : (
            <div className="space-y-2">
              {materials.map((m) => (
                <div
                  key={m.id}
                  className="flex flex-col sm:flex-row items-start sm:items-center justify-between rounded-lg border border-border bg-muted shadow-sm p-4 gap-2 hover:shadow-md transition-all"
                >
                  <div className="flex items-start gap-3 w-full">
                    <div className="mt-1">
                      {m.type === "QUIZ" ? (
                        <Link2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      ) : m.fileUrl ? (
                        <Paperclip className="h-5 w-5 text-green-600 dark:text-green-400" />
                      ) : (
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-base truncate">{m.title}</div>
                      {m.description ? (
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{m.description}</div>
                      ) : null}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="inline-block px-2 py-0.5 rounded bg-muted text-xs font-medium text-foreground/70 border border-border">
                          {m.type.charAt(0) + m.type.slice(1).toLowerCase()}
                        </span>
                        {m.linkUrl ? (
                          <a
                            href={m.linkUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 dark:text-blue-400 underline break-all"
                          >
                            {m.linkUrl.length > 32 ? m.linkUrl.slice(0, 32) + "..." : m.linkUrl}
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2 sm:mt-0">
                    {m.linkUrl ? (
                      <Button size="sm" variant="secondary" onClick={() => window.open(m.linkUrl!, "_blank")}>Open</Button>
                    ) : null}
                    {m.fileUrl ? (
                      <Button size="sm" variant="secondary" onClick={() => window.open(m.fileUrl!, "_blank")}>Download</Button>
                    ) : null}
                    {isTeacher ? (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="outline">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete material?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone. The material will be permanently removed for all students.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteMaterial(m.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {isTeacher && (
        <Card className="border-primary/20 bg-card/50 backdrop-blur-sm">
          <CardContent className="pt-6">
            <form onSubmit={handleCreatePost} className="space-y-4">
              <Textarea
                placeholder="Share an announcement with your class..."
                value={postContent}
                onChange={(e) => setPostContent(e.target.value)}
                disabled={postLoading}
                className="min-h-[100px] resize-none"
                required
              />
              <div className="flex justify-end">
                <Button type="submit" disabled={postLoading || !postContent.trim()}>
                  {postLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Posting...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Post
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {posts.length === 0 ? (
        <Card className="bg-card/50 backdrop-blur-sm">
          <CardContent className="py-16 text-center">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
              <svg className="h-8 w-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">No posts yet</h3>
            <p className="text-muted-foreground text-balance">
              {isTeacher ? "Create your first post to share with the class" : "Your teacher hasn't posted anything yet"}
            </p>
          </CardContent>
        </Card>
      ) : (
        posts.map((post) => (
          <Card key={post.id} className="bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <div className="flex items-start gap-3 sm:gap-4">
                <Avatar className="h-9 w-9 sm:h-10 sm:w-10 border-2 border-primary/20">
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                    {getInitials(post.author.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{post.author.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-balance">{post.content}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {post.comments.length > 0 && (
                <div className="space-y-3 pl-3 sm:pl-4 border-l-2 border-border">
                  {post.comments.map((comment) => (
                    <div key={comment.id} className="flex items-start gap-2 sm:gap-3">
                      <Avatar className="h-7 w-7 sm:h-8 sm:w-8 border border-border">
                        <AvatarFallback className="bg-muted text-xs font-semibold">
                          {getInitials(comment.author.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{comment.author.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground text-balance">{comment.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Input
                  placeholder="Add a comment..."
                  value={commentContent[post.id] || ""}
                  onChange={(e) => setCommentContent({ ...commentContent, [post.id]: e.target.value })}
                  disabled={commentLoading[post.id]}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      handleAddComment(post.id)
                    }
                  }}
                />
                <Button
                  size="sm"
                  onClick={() => handleAddComment(post.id)}
                  disabled={commentLoading[post.id] || !commentContent[post.id]?.trim()}
                >
                  {commentLoading[post.id] ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}
