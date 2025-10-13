import type { AxiosError } from "axios"

export type FormattedError = {
  title: string
  message: string
  status?: number
  endpoint?: string
  fieldErrors?: Record<string, string[] | string> | string[]
  retryable?: boolean
}

export function formatApiError(err: unknown, fallback = "Something went wrong."): FormattedError {
  const base: FormattedError = { title: "Request failed", message: fallback, retryable: true }
  // Axios error
  const ax = err as AxiosError<any>
  if (ax?.isAxiosError) {
    const status = ax.response?.status
    const data = ax.response?.data
    const url = ax.config?.url
    const method = ax.config?.method?.toUpperCase()
    const endpoint = method && url ? `${method} ${url}` : url

    let message =
      data?.message || data?.error || ax.message || fallback

    // Handle validation errors array or object
    let fieldErrors: Record<string, string[] | string> | string[] | undefined
    if (Array.isArray(data?.errors)) {
      fieldErrors = data.errors
      if (!message) message = "Please fix the errors and try again."
    } else if (data?.errors && typeof data.errors === "object") {
      fieldErrors = data.errors
      if (!message) message = "Please fix the errors and try again."
    }

    const retryable = status ? status >= 500 || status === 429 : true

    return {
      title: status ? `Error ${status}` : "Request error",
      message,
      status,
      endpoint,
      fieldErrors,
      retryable,
    }
  }

  // Network or unknown error
  const msg = (err as any)?.message || fallback
  return { ...base, title: "Network error", message: msg }
}
