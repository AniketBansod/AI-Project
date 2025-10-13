"use client"
import { useEffect } from "react"
import { AppError } from "@/components/shared/app-error"
import { Navbar } from "@/components/shared/navbar"

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }, reset: () => void }) {
  useEffect(() => {
    // Optionally log to an external service here
    // console.error(error)
  }, [error])

  return (
    <html>
      <body>
        <div className="min-h-screen bg-background">
          <Navbar />
          <main className="container mx-auto px-4 py-8 max-w-3xl">
            <AppError
              title="Unexpected error"
              message={error.message || "An unexpected error occurred."}
              details={error.digest}
              onRetry={() => reset()}
            />
          </main>
        </div>
      </body>
    </html>
  )
}
