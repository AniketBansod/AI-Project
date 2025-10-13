"use client"

import { useEffect, useState, useRef } from "react"
import { Navbar } from "@/components/shared/navbar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useToast } from "@/hooks/use-toast"
import { api } from "@/lib/axios"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Camera, Loader2 } from "lucide-react"
import { formatApiError } from "@/lib/errors"
import { AppError } from "@/components/shared/app-error"

interface Me {
  id: string
  name: string
  email: string
  role: string
  image?: string | null
}

export default function ProfilePage() {
  const { toast } = useToast()
  const [me, setMe] = useState<Me | null>(null)
  const [name, setName] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [reqLoading, setReqLoading] = useState(false)
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [errorState, setErrorState] = useState<{ title: string; message: string; status?: number; fieldErrors?: any; retryable?: boolean } | null>(null)
  const [currentPassword, setCurrentPassword] = useState("")
  const [otp, setOtp] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [otpStage, setOtpStage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const token = localStorage.getItem("token")
    if (!token) {
      window.location.href = "/login"
      return
    }
    loadProfile()
  }, [])

  const loadProfile = async () => {
    setLoading(true)
    try {
      const res = await api.get("/api/profile/me")
      setMe(res.data)
      setName(res.data.name || "")
      setErrorState(null)
    } catch (e: any) {
      const fe = formatApiError(e, "Failed to load profile")
      setErrorState({ title: fe.title, message: fe.message, status: fe.status, fieldErrors: fe.fieldErrors, retryable: fe.retryable })
      toast({ title: fe.title, description: fe.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const saveName = async () => {
    if (!name.trim()) {
      toast({ title: "Enter a valid name", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const res = await api.put("/api/profile/me", { name })
      setMe(res.data)
      // update localStorage user for navbar display
      const u = localStorage.getItem("user")
      if (u) {
        const ju = JSON.parse(u)
        ju.name = res.data.name
        localStorage.setItem("user", JSON.stringify(ju))
      }
      toast({ title: "Saved", description: "Name updated successfully" })
    } catch (e: any) {
      const fe = formatApiError(e, "Failed to update name")
      toast({ title: fe.title, description: fe.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const onPickAvatar = () => fileInputRef.current?.click()
  const onAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please upload an image.", variant: "destructive" })
      return
    }
    const maxMB = 4
    if (file.size > maxMB * 1024 * 1024) {
      toast({ title: "File too large", description: `Max size is ${maxMB}MB.`, variant: "destructive" })
      return
    }
    const form = new FormData()
    form.append("avatar", file)
    setUploadingAvatar(true)
    try {
      const res = await api.post("/api/profile/avatar", form, { headers: { "Content-Type": "multipart/form-data" } })
      setMe(res.data)
      // update local user cache
      const u = localStorage.getItem("user")
      if (u) {
        const ju = JSON.parse(u)
        ju.image = res.data.image
        localStorage.setItem("user", JSON.stringify(ju))
      }
      toast({ title: "Profile image updated" })
    } catch (e: any) {
      const fe = formatApiError(e, "Could not upload avatar")
      toast({ title: fe.title, description: fe.message, variant: "destructive" })
    } finally {
      setUploadingAvatar(false)
    }
  }

  const requestPasswordOtp = async () => {
    if (!currentPassword) {
      toast({ title: "Enter current password", variant: "destructive" })
      return
    }
    setReqLoading(true)
    try {
      await api.post("/api/profile/password/request", { currentPassword })
      setOtpStage(true)
      toast({ title: "OTP sent", description: "Check your email for the 6-digit code" })
    } catch (e: any) {
      toast({ title: "Failed", description: e.response?.data?.error || "Could not send OTP", variant: "destructive" })
    } finally {
      setReqLoading(false)
    }
  }

  const verifyPasswordChange = async () => {
    if (!otp || !newPassword) {
      toast({ title: "Enter OTP and new password", variant: "destructive" })
      return
    }
    setVerifyLoading(true)
    try {
      await api.post("/api/profile/password/verify", { otp, newPassword })
      setCurrentPassword("")
      setOtp("")
      setNewPassword("")
      setOtpStage(false)
      toast({ title: "Password changed" })
    } catch (e: any) {
      toast({ title: "Failed", description: e.response?.data?.error || "Could not change password", variant: "destructive" })
    } finally {
      setVerifyLoading(false)
    }
  }

  const getInitials = (name: string) =>
    (name || "")
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
        {loading ? (
          <div className="space-y-6">
            <Card className="bg-card/50 backdrop-blur-sm">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-16 w-16 rounded-full" />
                  <div className="w-full space-y-3">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-64" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 backdrop-blur-sm">
              <CardContent className="p-6 grid gap-4 md:grid-cols-2">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10 col-span-full" />
              </CardContent>
            </Card>
          </div>
        ) : errorState ? (
          <div className="max-w-3xl">
            <AppError
              title={errorState.title}
              message={errorState.message}
              status={errorState.status}
              fieldErrors={errorState.fieldErrors}
              retryable={errorState.retryable}
              onRetry={() => loadProfile()}
            />
          </div>
        ) : (
          <>
            <Card className="bg-card/50 backdrop-blur-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle>Account</CardTitle>
                  {me?.role && (
                    <Badge variant="secondary" className="uppercase tracking-wide">{me.role}</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <div className="relative">
                    <Avatar className="h-20 w-20 border-2 border-primary/20">
                      {me?.image ? <AvatarImage src={me.image} alt={me.name} /> : null}
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                        {getInitials(me?.name || "")}
                      </AvatarFallback>
                    </Avatar>
                    <Input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      ref={fileInputRef}
                      onChange={onAvatarChange}
                    />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm text-muted-foreground">Email</div>
                    <div className="text-sm">{me?.email}</div>
                    <div className="mt-3">
                      <Button variant="outline" size="sm" onClick={onPickAvatar} disabled={uploadingAvatar} className="gap-2">
                        {uploadingAvatar ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" /> Uploading...
                          </>
                        ) : (
                          <>
                            <Camera className="h-4 w-4" /> Change photo
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="name">Display name</Label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
                    <Button onClick={saveName} disabled={saving || name.trim() === (me?.name || "") }>
                      {saving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
                        </>
                      ) : (
                        "Save"
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">This name will be visible to your classes.</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>Security</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!otpStage ? (
                  <div className="grid gap-2">
                    <Label htmlFor="current">Current password</Label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input id="current" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Enter current password" />
                      <Button onClick={requestPasswordOtp} disabled={reqLoading}>
                        {reqLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...
                          </>
                        ) : (
                          "Send OTP"
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">We’ll email a 6-digit code to verify your identity.</p>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    <div className="grid gap-2">
                      <Label htmlFor="otp">OTP code</Label>
                      <Input id="otp" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="6-digit code" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="newpass">New password</Label>
                      <Input id="newpass" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters" />
                      <p className="text-xs text-muted-foreground">Use at least 8 characters. Avoid common words or personal info.</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => { setOtpStage(false); setOtp(""); setNewPassword("") }}>Back</Button>
                      <Button onClick={verifyPasswordChange} disabled={verifyLoading || !otp || !newPassword}>
                        {verifyLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Changing...
                          </>
                        ) : (
                          "Change password"
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  )
}
