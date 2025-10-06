"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { api } from "../../lib/axios"
import { useToast } from "@/hooks/use-toast"
import { Shield, Loader2, AlertTriangle, CheckCircle2, XCircle, Download } from "lucide-react"

interface Submission {
  id: string
  student: {
    name: string
  }
  fileUrl?: string
  report?: {
    similarity?: number
    aiProbability?: number
    status?: 'PENDING' | 'COMPLETED' | 'FAILED'
    highlights?: Array<{
      studentName: string
      similarity: number
    }>
  }
}

interface PlagiarismResult {
  similarity: number
  aiProbability: number
  highlights: Array<{
    studentName: string
    similarity: number
  }>
}

interface PlagiarismCheckButtonProps {
  submission: Submission
}

export function PlagiarismCheckButton({ submission }: PlagiarismCheckButtonProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<PlagiarismResult | null>(null)

  const report = submission.report

  const handleCheck = async () => {
    // If report object already indicates COMPLETED, show it immediately
    if (report?.status === 'COMPLETED' && report.similarity !== undefined) {
      setResult({
        similarity: report.similarity,
        aiProbability: report.aiProbability ?? 0,
        highlights: report.highlights ?? []
      })
      setOpen(true)
      return
    }

    setLoading(true)
    setOpen(true)

    try {
      const response = await api.get(`/api/plagiarism-reports/${submission.id}`)
      // map backend fields to our UI model
      const data = response.data
      const mapped: PlagiarismResult = {
        similarity: data.similarity_score ?? data.similarity ?? 0,
        aiProbability: data.ai_probability ?? data.aiProbability ?? 0,
        highlights: data.matches ?? data.highlights ?? []
      }
      setResult(mapped)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Could not fetch plagiarism report.",
        variant: "destructive",
      })
      setOpen(false)
    } finally {
      setLoading(false)
    }
  }

  // download highlighted pdf by calling your FastAPI endpoint
  const handleDownloadHighlightedPdf = async () => {
    if (!submission.fileUrl) {
      toast({ title: "No file", description: "Submission has no file to highlight.", variant: "destructive" })
      return
    }
    try {
      const resp = await api.get(
  `/api/submissions/${submission.id}/highlighted-pdf`,
  { responseType: "blob" }
)
      const blob = new Blob([resp.data], { type: "application/pdf" })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `highlighted_${submission.id}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.response?.data?.detail || "Failed to generate highlighted PDF.",
        variant: "destructive",
      })
    }
  }

  const getSeverityColor = (value: number) => {
    if (value >= 0.7) return "text-destructive"
    if (value >= 0.4) return "text-yellow-600"
    return "text-green-600"
  }

  const getSeverityIcon = (value: number) => {
    if (value >= 0.7) return <XCircle className="h-5 w-5 text-destructive" />
    if (value >= 0.4) return <AlertTriangle className="h-5 w-5 text-yellow-600" />
    return <CheckCircle2 className="h-5 w-5 text-green-600" />
  }

  const getSeverityLabel = (value: number) => {
    if (value >= 0.7) return "High Risk"
    if (value >= 0.4) return "Medium Risk"
    return "Low Risk"
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleCheck}
        disabled={loading || report?.status === 'PENDING'}
        className="gap-2 bg-transparent w-[180px] justify-center"
      >
        {loading || report?.status === 'PENDING' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Shield className="h-4 w-4" />
        )}

        {report?.status === 'PENDING' && "Analyzing..."}
        {report?.status === 'COMPLETED' && "View Report"}
        {report?.status === 'FAILED' && "Analysis Failed"}
        {!report && "Check Plagiarism"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Plagiarism Detection Report
            </DialogTitle>
            <DialogDescription>Analysis for {submission.student.name}'s submission</DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="py-12 text-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
              <div className="space-y-2">
                <p className="font-medium">Fetching latest report...</p>
                <p className="text-sm text-muted-foreground">This may take a moment.</p>
              </div>
            </div>
          ) : result ? (
            <div className="space-y-6 py-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Overall Similarity Score</p>
                    <div className="flex items-center gap-3">
                      {getSeverityIcon(result.similarity * 100)}
                      <span className={`text-3xl font-bold ${getSeverityColor(result.similarity * 100)}`}>
                        {(result.similarity * 100).toFixed(1)}%
                      </span>
                      <Badge
                        variant={
                          result.similarity >= 0.7 ? "destructive" : result.similarity >= 0.4 ? "secondary" : "default"
                        }
                      >
                        {getSeverityLabel(result.similarity * 100)}
                      </Badge>
                    </div>
                  </div>

                  {/* AI probability display */}
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">AI Probability</p>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{(result.aiProbability * 100).toFixed(1)}%</span>
                    </div>
                    <Progress value={Math.round(result.aiProbability * 100)} className="h-2 mt-2" />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Similarity Level</span>
                    <span className={`font-medium ${getSeverityColor(result.similarity * 100)}`}>{(result.similarity * 100).toFixed(1)}%</span>
                  </div>
                  <Progress value={result.similarity * 100} className="h-2" />
                </div>
              </div>

              {result.highlights && result.highlights.length > 0 && (
                <div className="space-y-3 pt-4">
                  <h4 className="font-semibold text-sm">Top Source Matches</h4>
                  {result.highlights.map((match, index) => (
                    <div key={index} className="p-4 rounded-lg border bg-card">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">Submission by: {match.studentName}</span>
                        <Badge variant={match.similarity >= 0.7 ? "destructive" : "secondary"}>
                          {(match.similarity * 100).toFixed(1)}% match
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4">
                {submission.fileUrl && (
                  <Button size="sm" variant="ghost" onClick={handleDownloadHighlightedPdf} className="gap-2">
                    <Download className="h-4 w-4" />
                    Download Highlighted PDF
                  </Button>
                )}
                <Button size="sm" onClick={() => setOpen(false)}>Close</Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <XCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="font-medium">Report Not Available</p>
              <p className="text-sm text-muted-foreground">The plagiarism report could not be loaded.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
