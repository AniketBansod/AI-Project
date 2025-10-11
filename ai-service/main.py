# main.py
"""
FastAPI app for AI-Powered Plagiarism Detection (Direct-call Integration)
Compatible with Node backend using /check and /highlight_pdf endpoints.
Background worker (Celery) integration has been removed to reduce memory usage.
"""

import os
from fastapi import FastAPI, Body, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from dotenv import load_dotenv
from ai_detector import detect_ai_probability

load_dotenv()

app = FastAPI(title="AI-Powered Plagiarism Detection Service")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"status": "ok", "message": "AI Service is running"}


# ---------------------------
# Direct-call endpoints
# ---------------------------

@app.post("/check")
async def check_endpoint(
    payload: dict = Body(..., example={
        "submission_id": "sub_123",
        "assignment_id": "asg_456",
        "text_content": "Optional text",
        "file_url": "https://example.com/file.pdf"
    })
):
    """Run plagiarism + AI probability detection."""
    from tasks.plagiarism_tasks import run_check

    submission_id = payload.get("submission_id")
    assignment_id = payload.get("assignment_id")
    text_content = payload.get("text_content", "")
    file_url = payload.get("file_url")

    if not submission_id:
        raise HTTPException(status_code=400, detail="submission_id is required")

    try:
        result = run_check(submission_id, assignment_id, text_content, file_url)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Check failed: {e}")


@app.post("/highlight_pdf")
async def highlight_pdf_endpoint(
    payload: dict = Body(..., example={
        "submission_id": "sub_123",
        "assignment_id": "asg_456",
        "file_url": "https://example.com/file.pdf"
    })
):
    """Generate highlighted PDF and return it as a stream."""
    from tasks.plagiarism_tasks import generate_highlighted_pdf

    submission_id = payload.get("submission_id")
    assignment_id = payload.get("assignment_id")
    file_url = payload.get("file_url")

    if not submission_id or not file_url:
        raise HTTPException(status_code=400, detail="submission_id and file_url are required")

    try:
        pdf_bytes = generate_highlighted_pdf(file_url, submission_id, assignment_id)
        headers = {
            "Content-Disposition": f"attachment; filename=submission_{submission_id}_highlighted.pdf",
            "Content-Type": "application/pdf",
        }
        return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate PDF: {e}")

