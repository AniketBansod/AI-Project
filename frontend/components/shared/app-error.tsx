"use client"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface AppErrorProps {
  title?: string
  message?: string
  details?: string
  status?: number
  onRetry?: () => void
  retryable?: boolean
  fieldErrors?: Record<string, string[] | string> | string[]
}

export function AppError({ title = "Something went wrong", message, details, status, onRetry, retryable = true, fieldErrors }: AppErrorProps) {
  return (
    <Card className="bg-destructive/5 border-destructive/30">
      <CardHeader className="flex flex-row items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <CardTitle className="text-base">
            {status ? `${title}` : title}
          </CardTitle>
          {message && <p className="text-sm text-muted-foreground mt-1">{message}</p>}
        </div>
        {onRetry && retryable && (
          <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Retry
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {details && (
          <pre className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs text-muted-foreground overflow-auto">
            {details}
          </pre>
        )}
        {fieldErrors && (
          <div className="text-sm">
            {Array.isArray(fieldErrors) ? (
              <ul className="list-disc pl-5 space-y-1">
                {fieldErrors.map((e, i) => (
                  <li key={i} className="text-muted-foreground">{e}</li>
                ))}
              </ul>
            ) : (
              <div className="grid gap-2">
                {Object.entries(fieldErrors).map(([field, msgs]) => (
                  <div key={field} className="text-muted-foreground">
                    <span className="font-medium text-foreground">{field}:</span> {Array.isArray(msgs) ? msgs.join(", ") : msgs}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
