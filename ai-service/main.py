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
from typing import Any, Dict

# Optional deps for diagnostics
try:
    import redis as _redis
except Exception:
    _redis = None  # type: ignore
try:
    import boto3 as _boto3
except Exception:
    _boto3 = None  # type: ignore

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


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/ready")
async def ready():
    # Simple readiness probe; extend with model/cache checks if needed
    # Report a few key env toggles for diagnostics (non-secret)
    return {
        "status": "ready",
        "exclude_same_student": os.getenv("EXCLUDE_SAME_STUDENT_MATCHES", "false"),
        "faiss_index_path": os.getenv("FAISS_INDEX_PATH", "/app/data/faiss_index.bin"),
        "faiss_meta_path": os.getenv("FAISS_META_PATH", "/app/data/faiss_meta.pkl"),
    }


@app.get("/diagnostics")
async def diagnostics() -> Dict[str, Any]:
    """Quick environment health snapshot to debug deployment issues."""
    info: Dict[str, Any] = {
        "status": "ok",
        "env": {
            "has_database_url": bool(os.getenv("DATABASE_URL")),
            "has_redis_url": bool(os.getenv("REDIS_URL")),
            "has_s3_creds": bool(os.getenv("AWS_ACCESS_KEY_ID") and os.getenv("AWS_SECRET_ACCESS_KEY")),
            "region": os.getenv("AWS_REGION"),
        },
        "faiss": {},
        "redis": {},
        "s3": {},
    }

    # FAISS index status
    try:
        from backend.src.vector_index import get_vector_index  # lazy import
        vi = get_vector_index()
        meta_len = len(vi.meta or [])
        dim = getattr(vi.index, 'd', None)
        info["faiss"] = {"meta_entries": meta_len, "dim": dim}
    except Exception as e:
        info["faiss"] = {"error": str(e)}

    # Redis ping (if configured)
    try:
        ru = os.getenv("REDIS_URL")
        if ru and _redis:
            client = _redis.from_url(ru, decode_responses=True)
            client.ping()
            info["redis"] = {"ok": True}
        else:
            info["redis"] = {"ok": False, "reason": "missing url or driver"}
    except Exception as e:
        info["redis"] = {"ok": False, "error": str(e)}

    # S3 creds present (no network call)
    try:
        if _boto3 and os.getenv("AWS_ACCESS_KEY_ID") and os.getenv("AWS_SECRET_ACCESS_KEY"):
            # Just instantiate client; don't perform external call
            _boto3.client("s3", region_name=os.getenv("AWS_REGION") or "us-east-1")
            info["s3"] = {"ok": True}
        else:
            info["s3"] = {"ok": False, "reason": "missing creds or boto3"}
    except Exception as e:
        info["s3"] = {"ok": False, "error": str(e)}

    return info


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

