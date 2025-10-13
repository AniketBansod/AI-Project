import axios from "axios"

// Allow either var name; trim trailing slash
const RAW_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  ""
const API_BASE_URL = RAW_BASE.replace(/\/$/, "")

export const api = axios.create({
  baseURL: API_BASE_URL, // Set to full API base in env, e.g. https://api.<IP>.nip.io/api
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
})

// Add token to requests if available (browser only)
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token")
    if (token) {
      config.headers = config.headers ?? {}
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

// Handle auth errors (browser only)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== "undefined") {
        localStorage.removeItem("token")
        localStorage.removeItem("user")
        window.location.href = "/login"
      }
    }
    return Promise.reject(error)
  },
)
