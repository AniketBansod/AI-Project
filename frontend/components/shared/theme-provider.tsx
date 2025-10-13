"use client"
import { useEffect, useState } from "react"

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    const stored = localStorage.getItem("theme")
    if (stored === "dark" || stored === "light") {
      root.classList.toggle("dark", stored === "dark")
    } else {
      // respect system
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      root.classList.toggle("dark", prefersDark)
    }
    setMounted(true)
  }, [])

  if (!mounted) return <>{children}</>
  return <>{children}</>
}

export function toggleTheme() {
  const root = document.documentElement
  const isDark = root.classList.contains("dark")
  const next = isDark ? "light" : "dark"
  root.classList.toggle("dark", next === "dark")
  localStorage.setItem("theme", next)
}
