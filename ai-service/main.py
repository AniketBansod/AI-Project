# main.py
import os
import io
import requests
import fitz  # PyMuPDF
import docx
import nltk
import statistics
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
import psycopg2
from pgvector.psycopg2 import register_vector
from dotenv import load_dotenv
from transformers import pipeline
from typing import List

# ----------- Config & Setup -----------
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
PORT = int(os.getenv("AI_SERVICE_PORT", 8000))

CHUNK_SIZE_WORDS = int(os.getenv("CHUNK_SIZE_WORDS", 300))
CHUNK_OVERLAP_WORDS = int(os.getenv("CHUNK_OVERLAP_WORDS", 50))
TOP_K = int(os.getenv("TOP_K", 5))

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-mpnet-base-v2")
DETECTOR_MODELS = [
    "Hello-SimpleAI/chatgpt-detector-roberta",
    "roberta-base-openai-detector"
]

# Ensure nltk tokenizer is available
try:
    nltk.data.find("tokenizers/punkt")
except Exception:
    nltk.download("punkt")

app = FastAPI(title="AI-Powered Classroom - AI Service")

# ----------- Load models -----------
print("Loading embedding model:", EMBEDDING_MODEL)
similarity_model = SentenceTransformer(EMBEDDING_MODEL)
print("Embedding model loaded.")

detector_pipelines = []
for name in DETECTOR_MODELS:
    try:
        print("Loading detector:", name)
        p = pipeline("text-classification", model=name, truncation=True)
        detector_pipelines.append((name, p))
    except Exception as e:
        print(f"Could not load detector {name}: {e} (skipping)")

print("Detectors available:", [n for n, _ in detector_pipelines])

# ----------- DB helper -----------
def get_db_connection():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL env var not set")
    conn = psycopg2.connect(DATABASE_URL)
    register_vector(conn)
    return conn

# ----------- File text extraction -----------
def extract_text_from_pdf(content: bytes) -> str:
    try:
        with fitz.open(stream=content, filetype="pdf") as doc:
            return "\n".join([page.get_text() for page in doc])
    except Exception as e:
        print("PDF extraction error:", e)
        raise

def extract_text_from_docx(content: bytes) -> str:
    try:
        doc = docx.Document(io.BytesIO(content))
        return "\n".join([p.text for p in doc.paragraphs])
    except Exception as e:
        print("DOCX extraction error:", e)
        raise

# ----------- Chunking -----------
def chunk_text_words(text: str, chunk_size: int = CHUNK_SIZE_WORDS, overlap: int = CHUNK_OVERLAP_WORDS) -> List[str]:
    words = text.split()
    if not words:
        return []
    step = max(chunk_size - overlap, 1)
    chunks = []
    for i in range(0, len(words), step):
        chunks.append(" ".join(words[i:i+chunk_size]))
        if i + chunk_size >= len(words):
            break
    return chunks

# ----------- AI detection -----------
def detect_ai_probability(text: str) -> float:
    if not detector_pipelines:
        return 0.0
    chunk_size_chars = 500
    text_chunks = [text[i:i+chunk_size_chars] for i in range(0, len(text), chunk_size_chars)]

    model_scores = []
    for name, det in detector_pipelines:
        try:
            chunk_scores = []
            for c in text_chunks:
                out = det(c[:512])
                if not out:
                    continue
                top = out[0]
                label = top.get("label", "").lower()
                score = float(top.get("score", 0.0))
                if label.startswith("fake") or "machine" in label or "ai" in label:
                    chunk_scores.append(score)
                elif label.startswith("real") or "human" in label:
                    chunk_scores.append(1.0 - score)
                else:
                    chunk_scores.append(score)
            if chunk_scores:
                model_scores.append(statistics.mean(chunk_scores))
        except Exception as e:
            print(f"Detector {name} failed: {e}")
            continue
    return float(statistics.mean(model_scores)) if model_scores else 0.0

# ----------- Pydantic models -----------
class PlagiarismRequest(BaseModel):
    submission_id: str
    assignment_id: str          # <-- New field to filter by assignment
    text_content: str | None = None
    file_url: str | None = None

class MatchItem(BaseModel):
    submission_id: str
    similarity: float

class PlagiarismResponse(BaseModel):
    similarity_score: float
    ai_probability: float
    matches: List[MatchItem] = []

# ----------- Endpoint -----------
@app.post("/check", response_model=PlagiarismResponse)
def check_plagiarism(request: PlagiarismRequest):
    submission_text = ""
    # Load text from file or text content
    if request.file_url:
        try:
            resp = requests.get(request.file_url, timeout=30)
            resp.raise_for_status()
            lower = request.file_url.lower()
            if lower.endswith(".pdf"):
                submission_text = extract_text_from_pdf(resp.content)
            elif lower.endswith(".docx"):
                submission_text = extract_text_from_docx(resp.content)
            else:
                submission_text = resp.text
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch/parse file: {e}")
    elif request.text_content:
        submission_text = request.text_content

    if not submission_text.strip():
        return PlagiarismResponse(similarity_score=0.0, ai_probability=0.0, matches=[])

    # AI detection
    ai_prob = detect_ai_probability(submission_text)

    # Chunk + embeddings
    chunks = chunk_text_words(submission_text)
    if not chunks:
        return PlagiarismResponse(similarity_score=0.0, ai_probability=round(ai_prob, 4), matches=[])

    embeddings_chunks = similarity_model.encode(chunks, convert_to_numpy=True, show_progress_bar=False)
    embedding_doc = similarity_model.encode([submission_text], convert_to_numpy=True, show_progress_bar=False)[0]

    # Database similarity check (assignment-specific)
    conn = get_db_connection()
    cur = conn.cursor()
    match_best = {}
    chunk_top_means = []

    # Chunk-level similarity
    for emb in embeddings_chunks:
        emb_list = emb.tolist()
        cur.execute(
            'SELECT sc."submissionId", 1 - (sc.embedding_mpnet <=> %s::vector) AS similarity '
            'FROM "SubmissionChunk" sc '
            'JOIN "Submission" s ON sc."submissionId" = s.id '
            'WHERE sc."submissionId" != %s AND s."assignmentId" = %s '
            'ORDER BY similarity DESC LIMIT %s',
            (emb_list, request.submission_id, request.assignment_id, TOP_K)
        )
        rows = cur.fetchall()
        sims = [float(r[1]) for r in rows if r[1] is not None]
        if sims:
            chunk_top_means.append(statistics.mean(sims))
        for r in rows:
            sid, sim = r[0], float(r[1])
            if sim > match_best.get(sid, 0.0):
                match_best[sid] = sim

    # Doc-level similarity
    doc_list = embedding_doc.tolist()
    cur.execute(
        'SELECT sc."submissionId", 1 - (sc.embedding_mpnet <=> %s::vector) AS similarity '
        'FROM "SubmissionChunk" sc '
        'JOIN "Submission" s ON sc."submissionId" = s.id '
        'WHERE sc."submissionId" != %s AND s."assignmentId" = %s '
        'ORDER BY similarity DESC LIMIT %s',
        (doc_list, request.submission_id, request.assignment_id, TOP_K)
    )
    doc_rows = cur.fetchall()
    doc_top_mean = statistics.mean([float(r[1]) for r in doc_rows]) if doc_rows else 0.0
    for r in doc_rows:
        sid, sim = r[0], float(r[1])
        if sim > match_best.get(sid, 0.0):
            match_best[sid] = sim

    # Insert doc embedding
    cur.execute(
        'INSERT INTO "SubmissionChunk" (id, content, embedding_mpnet, "submissionId", "createdAt") '
        'VALUES (gen_random_uuid(), %s, %s::vector, %s, NOW())',
        (submission_text, doc_list, request.submission_id)
    )

    # Insert chunk embeddings
    for i, chunk in enumerate(chunks):
        emb_list = embeddings_chunks[i].tolist()
        cur.execute(
            'INSERT INTO "SubmissionChunk" (id, content, embedding_mpnet, "submissionId", "createdAt") '
            'VALUES (gen_random_uuid(), %s, %s::vector, %s, NOW())',
            (chunk, emb_list, request.submission_id)
        )

    conn.commit()
    cur.close()
    conn.close()

    # Aggregate similarity safely
    all_match_values = [float(v) for v in match_best.values()] if match_best else [0.0]
    chunk_mean = statistics.mean(chunk_top_means) if chunk_top_means else 0.0
    final_similarity = max(all_match_values + [chunk_mean, doc_top_mean])

    top_matches = sorted(
        [{"submission_id": sid, "similarity": sim} for sid, sim in match_best.items()],
        key=lambda x: x["similarity"], reverse=True
    )[:10]

    return PlagiarismResponse(
        similarity_score=round(final_similarity, 4),
        ai_probability=round(ai_prob, 4),
        matches=[MatchItem(**m) for m in top_matches]
    )
