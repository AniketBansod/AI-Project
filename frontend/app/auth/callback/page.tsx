"use client"

import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { api } from "@/lib/axios"
import { useToast } from "@/hooks/use-toast"
import { Loader2 } from "lucide-react"

export default function AuthCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  useEffect(() => {
    const token = searchParams.get("token")

    if (token) {
      // 1. Save the token from the URL
      localStorage.setItem("token", token)

      // 2. Fetch user data using the new token
      const fetchUser = async () => {
        try {
          const response = await api.get("/auth/me", {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          })
          const user = response.data

          // 3. Save user data
          localStorage.setItem("user", JSON.stringify(user))

          toast({
            title: "Welcome!",
            description: "You have successfully signed in with Google.",
          })

          // 4. Redirect to the dashboard
          router.push("/dashboard")
        } catch (error) {
          toast({
            title: "Authentication Failed",
            description: "Could not fetch user details. Please try again.",
            variant: "destructive",
          })
          router.push("/login")
        }
      }

      fetchUser()
    } else {
      // Handle cases where the token is missing
      toast({
        title: "Authentication Error",
        description: "No authentication token provided.",
        variant: "destructive",
      })
      router.push("/login")
    }
  }, [router, searchParams, toast])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background space-y-4">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="text-muted-foreground">Authenticating, please wait...</p>
    </div>
  )
}
