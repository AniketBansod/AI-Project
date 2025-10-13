export const NODE_ENV = process.env.NODE_ENV || "development"

// Public base seen by browsers/providers (no trailing slash)
// e.g. https://api.<VM_IP>.nip.io
export const PUBLIC_API_BASE =
  (process.env.PUBLIC_API_BASE_URL || process.env.API_PUBLIC_URL || "http://localhost:5000").replace(/\/$/, "")

// Frontend base (Vercel domain), used for email links and OAuth redirect
// e.g. https://ai-project-mu-dun.vercel.app
export const PUBLIC_APP_BASE =
  (process.env.PUBLIC_APP_BASE_URL || process.env.APP_PUBLIC_URL || "http://localhost:3000").replace(/\/$/, "")

// CORS allowlist (comma-separated)
export const CORS_ALLOWED =
  (process.env.CORS_ORIGIN || process.env.CORS_ALLOWED || "").split(",").map(s => s.trim()).filter(Boolean)