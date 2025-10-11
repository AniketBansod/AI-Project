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
import { Loader2, Send } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

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
