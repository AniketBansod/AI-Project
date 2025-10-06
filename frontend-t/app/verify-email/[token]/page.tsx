"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "../../../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card"
import { api } from "../../../lib/axios"
import { Loader2, CheckCircle2, XCircle } from "lucide-react"

type VerificationState = "loading" | "success" | "error"

export default function VerifyEmailPage() {
  const params = useParams()
  const router = useRouter()
  const [state, setState] = useState<VerificationState>("loading")
  const [message, setMessage] = useState("Please wait while we verify your email address...")

  useEffect(() => {
    const token = params.token as string | string[] | undefined

    if (typeof token !== "string" || !token) {
      const timer = setTimeout(() => {
        if (state === "loading") {
          setState("error")
          setMessage("Verification token not found in the URL.")
        }
      }, 2000)
      return () => clearTimeout(timer)
    }

    const verifyEmail = async () => {
      try {
        const response = await api.get(`/auth/verify-email/${token}`)
        setState("success")
        setMessage(response.data.message || "Email verified successfully!")
      } catch (error: any) {
        const errMsg = error.response?.data?.error
        if (errMsg === "Invalid verification token") {
          // Handle case where token is already consumed but email is verified
          setState("success")
          setMessage("Your email is already verified!")
        } else {
          setState("error")
          setMessage(errMsg || "Invalid or expired token. Please try again.")
        }
      }
    }

    verifyEmail()
  }, [params.token]) // ✅ only depend on token

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md border-border/50 shadow-xl text-center">
        <CardHeader className="space-y-4">
          <div className="flex justify-center">
            {state === "loading" && (
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              </div>
            )}
            {state === "success" && (
              <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              </div>
            )}
            {state === "error" && (
              <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <XCircle className="h-8 w-8 text-destructive" />
              </div>
            )}
          </div>
          <CardTitle className="text-2xl font-bold text-balance">
            {state === "loading" && "Verifying your email..."}
            {state === "success" && "Email Verified!"}
            {state === "error" && "Verification Failed"}
          </CardTitle>
          <CardDescription className="text-balance">{message}</CardDescription>
        </CardHeader>
        {state !== "loading" && (
          <CardContent>
            <Button
              onClick={() => router.push("/login")}
              className="w-full"
              variant={state === "success" ? "default" : "outline"}
            >
              {state === "success" ? "Go to Login" : "Back to Login"}
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
