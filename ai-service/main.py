# main.py (optimized, drop-in replacement)
import os
import io
import json
import requests
import fitz  # PyMuPDF
import nltk
import statistics
import difflib
from fastapi import FastAPI, HTTPException, Body
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
import psycopg2
from psycopg2 import pool
from pgvector.psycopg2 import register_vector
from dotenv import load_dotenv
from transformers import pipeline
from typing import List, Optional
from functools import lru_cache
import concurrent.futures
import redis

# ----------- Config & Setup -----------
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
PORT = int(os.getenv("AI_SERVICE_PORT", 8000))
REDIS_URL = os.getenv("REDIS_URL")
CHUNK_SIZE_WORDS = int(os.getenv("CHUNK_SIZE_WORDS", 150))
CHUNK_OVERLAP_WORDS = int(os.getenv("CHUNK_OVERLAP_WORDS", 50))
TOP_K = int(os.getenv("TOP_K", 5))
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-mpnet-base-v2")
DETECTOR_MODELS = [
    "Hello-SimpleAI/chatgpt-detector-roberta",
    "roberta-base-openai-detector"
]

# thresholds (can later be moved to DB/config)
AI_THRESHOLD = float(os.getenv("AI_THRESHOLD", 0.5))
PLAG_THRESHOLD = float(os.getenv("PLAG_THRESHOLD", 0.6))

# Ensure nltk tokenizer is available
try:
    nltk.data.find("tokenizers/punkt")
except Exception:
    nltk.download("punkt")

app = FastAPI(title="AI-Powered Classroom - AI Service (Optimized)")

# ----------- Redis client (optional cache) -----------
redis_client: Optional[redis.Redis] = None
if REDIS_URL:
    try:
        redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
        # quick ping to detect connection problems at startup
        redis_client.ping()
        print("Connected to Redis at", REDIS_URL)
    except Exception as e:
        print("Could not connect to Redis:", e)
        redis_client = None

# ----------- Postgres connection pool -----------
db_pool = None
if DATABASE_URL:
    try:
        # minconn=1, maxconn=10 (tune as needed)
        db_pool = pool.SimpleConnectionPool(1, 10, DATABASE_URL)
        # register vector for a single connection so psycopg2 knows about pgvector types
        conn_temp = db_pool.getconn()
        try:
            register_vector(conn_temp)
        finally:
            db_pool.putconn(conn_temp)
        print("Database connection pool created.")
    except Exception as e:
        print("Failed to create DB pool:", e)
        db_pool = None
else:
    print("DATABASE_URL not set; DB features will fail at runtime.")

def get_db_connection():
    if not db_pool:
        raise RuntimeError("DB pool not initialized (DATABASE_URL missing or pool creation failed)")
    conn = db_pool.getconn()
    try:
        # Test the connection by running a lightweight query
        with conn.cursor() as cur:
            cur.execute("SELECT 1;")
    except Exception:
        # If connection is broken, replace it
        try:
            db_pool.putconn(conn, close=True)
        except Exception:
            pass
        conn = db_pool.getconn()
    return conn


def release_db_connection(conn):
    if db_pool and conn:
        db_pool.putconn(conn)

# ----------- Model loading (memoized) -----------
@lru_cache(maxsize=1)
def load_similarity_model():
    print("Loading embedding model:", EMBEDDING_MODEL)
    model = SentenceTransformer(EMBEDDING_MODEL)
    print("Embedding model loaded.")
    return model

similarity_model = load_similarity_model()

# Load detector pipelines but handle errors gracefully
detector_pipelines = []
for name in DETECTOR_MODELS:
    try:
        print("Loading detector:", name)
        p = pipeline("text-classification", model=name, truncation=True)
        detector_pipelines.append((name, p))
    except Exception as e:
        print(f"Could not load detector {name}: {e} (skipping)")

print("Detectors available:", [n for n, _ in detector_pipelines])

# ----------- File text extraction -----------
def extract_text_from_pdf(content: bytes) -> str:
    try:
        with fitz.open(stream=content, filetype="pdf") as doc:
            texts = []
            for page in doc:
                texts.append(page.get_text())
            return "\n".join(texts)
    except Exception as e:
        print("PDF extraction error:", e)
        raise

def extract_text_from_docx(content: bytes) -> str:
    try:
        import docx
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

# ----------- AI detection (parallelized) -----------
def _score_with_detector(det_tuple, text_chunks):
    name, det = det_tuple
    try:
        chunk_scores = []
        for c in text_chunks:
            # limit length to detector's max token support (safe truncation)
            try:
                out = det(c[:512])
            except Exception:
                # if pipeline call fails for this chunk, skip it
                continue
            if not out:
                continue
            top = out[0]
            label = (top.get("label") or "").lower()
            score = float(top.get("score", 0.0))
            # heuristics to map detector labels to "ai probability"
            if label.startswith("fake") or "machine" in label or "ai" in label:
                chunk_scores.append(score)
            elif label.startswith("real") or "human" in label:
                chunk_scores.append(1.0 - score)
            else:
                chunk_scores.append(score)
        if chunk_scores:
            return statistics.mean(chunk_scores)
    except Exception as e:
        print(f"Detector {_get_name(det_tuple)} failed overall: {e}")
    return None

def _get_name(det_tuple):
    return det_tuple[0] if det_tuple else "unknown"

def detect_ai_probability(text: str) -> float:
    """
    Returns a score in [0.0, 1.0] estimating probability text is AI-generated.
    Uses available detector pipelines and runs them in parallel.
    """
    if not detector_pipelines:
        return 0.0
    chunk_size_chars = 500
    text_chunks = [text[i:i+chunk_size_chars] for i in range(0, len(text), chunk_size_chars)]
    if not text_chunks:
        return 0.0

    with concurrent.futures.ThreadPoolExecutor(max_workers=len(detector_pipelines)) as executor:
        futures = [executor.submit(_score_with_detector, det_tuple, text_chunks) for det_tuple in detector_pipelines]
        results = [f.result() for f in concurrent.futures.as_completed(futures)]

    valid = [r for r in results if r is not None]
    return float(statistics.mean(valid)) if valid else 0.0

# ----------- Redis caching helpers (safe, optional) -----------
def _cache_key_for_check(assignment_id: str, submission_id: str):
    return f"plagiarism:{assignment_id}:{submission_id}"

def cache_result(assignment_id: str, submission_id: str, result: dict, ttl_seconds: int = 3600):
    if not redis_client:
        return
    try:
        key = _cache_key_for_check(assignment_id, submission_id)
        redis_client.setex(key, ttl_seconds, json.dumps(result))
    except Exception as e:
        print("Redis cache set failed:", e)

def get_cached_result(assignment_id: str, submission_id: str):
    if not redis_client:
        return None
    try:
        key = _cache_key_for_check(assignment_id, submission_id)
        data = redis_client.get(key)
        if data:
            return json.loads(data)
    except Exception as e:
        print("Redis cache get failed:", e)
    return None

# ----------- Pydantic models -----------
class PlagiarismRequest(BaseModel):
    submission_id: str
    assignment_id: str
    text_content: Optional[str] = None
    file_url: Optional[str] = None

class HighlightRequest(BaseModel):
    submission_id: Optional[str] = None
    file_url: Optional[str] = None

class MatchItem(BaseModel):
    submission_id: str
    similarity: float

class PlagiarismResponse(BaseModel):
    similarity_score: float
    ai_probability: float
    matches: List[MatchItem] = []

# ----------- Utility: align sentence word count to PDF words (improved) -----------
def _word_tokenize_safe(text):
    try:
        return nltk.word_tokenize(text)
    except Exception:
        # fallback naive split
        return text.split()

def align_sentence_to_words(sentence, words, start_idx):
    """
    Attempt to determine how many words of `words` (list of dicts with 'text')
    correspond to the sentence starting at start_idx. Using sequence matching
    to be robust to tokenization differences.
    Returns number of words consumed.
    """
    sentence_words = _word_tokenize_safe(sentence)
    # build a candidate window from words list starting at start_idx
    max_window = len(sentence_words) + 10  # allow some slack
    seq = [w["text"] for w in words[start_idx:start_idx + max_window]]
    if not seq:
        return 0
    seq_join = " ".join(seq)
    sent_join = " ".join(sentence_words)
    # use difflib to find best alignment
    matcher = difflib.SequenceMatcher(None, seq_join, sent_join)
    match = matcher.find_longest_match(0, len(seq_join), 0, len(sent_join))
    if match.size == 0:
        # fallback: assume sentence length ~ sentence_words
        return len(sentence_words)
    # estimate words matched by counting words in matched span in seq_join
    matched_text = seq_join[match.a: match.a + match.size]
    matched_word_count = len(matched_text.split())
    # ensure at least 1 and not exceeding window
    return max(1, min(matched_word_count, len(seq)))

# ----------- Endpoint: plagiarism check (keeps same contract) -----------
@app.post("/check", response_model=PlagiarismResponse)
def check_plagiarism(request: PlagiarismRequest):
    # First attempt to return cached result (safe, non-breaking)
    cached = None
    try:
        cached = get_cached_result(request.assignment_id, request.submission_id)
    except Exception:
        cached = None
    if cached:
        # ensure response matches model shape
        return PlagiarismResponse(**cached)

    submission_text = ""
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

    if not submission_text or not submission_text.strip():
        result = {"similarity_score": 0.0, "ai_probability": 0.0, "matches": []}
        cache_result(request.assignment_id, request.submission_id, result)
        return PlagiarismResponse(**result)

    # compute AI probability (per-document)
    ai_prob = detect_ai_probability(submission_text)

    # chunk document and get embeddings
    chunks = chunk_text_words(submission_text)
    if not chunks:
        result = {"similarity_score": 0.0, "ai_probability": round(ai_prob, 4), "matches": []}
        cache_result(request.assignment_id, request.submission_id, result)
        return PlagiarismResponse(**result)

    try:
        # encode in batches (avoid show_progress_bar interruption in server)
        embeddings_chunks = similarity_model.encode(chunks, convert_to_numpy=True, show_progress_bar=False)
        embedding_doc = similarity_model.encode([submission_text], convert_to_numpy=True, show_progress_bar=False)[0]
    except Exception as e:
        print("Embedding error:", e)
        raise HTTPException(status_code=500, detail=f"Embedding model failed: {e}")

    # open DB conn from pool
    conn = get_db_connection()
    cur = conn.cursor()
    match_best = {}
    chunk_top_means = []

    try:
        # For each chunk, search top-k similar submission chunks for same assignment
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

        # Document-level search (top-k)
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

        # Insert embeddings (document + chunks) in bulk using executemany
        # Prepare params list
        # First, document-level row (content is full submission_text)
        # We'll insert document row first, then chunks
        insert_statements = []
        insert_params = []
        # document row
        insert_params.append((submission_text, doc_list, request.submission_id))
        # chunk rows
        for i, chunk in enumerate(chunks):
            emb_list = embeddings_chunks[i].tolist()
            insert_params.append((chunk, emb_list, request.submission_id))

        cur.executemany(
            'INSERT INTO "SubmissionChunk" (id, content, embedding_mpnet, "submissionId", "createdAt") '
            'VALUES (gen_random_uuid(), %s, %s::vector, %s, NOW())',
            insert_params
        )

        conn.commit()

    except Exception as e:
        # rollback on error, but do not crash service
        try:
            conn.rollback()
        except Exception:
            pass
        print("DB processing error in /check:", e)
        raise HTTPException(status_code=500, detail=f"Database error during plagiarism check: {e}")
    finally:
        try:
            cur.close()
        except Exception:
            pass
        release_db_connection(conn)

    # compute final similarity
    all_match_values = [float(v) for v in match_best.values()] if match_best else [0.0]
    chunk_mean = statistics.mean(chunk_top_means) if chunk_top_means else 0.0
    final_similarity = max(all_match_values + [chunk_mean, doc_top_mean])

    top_matches = sorted(
        [{"submission_id": sid, "similarity": sim} for sid, sim in match_best.items()],
        key=lambda x: x["similarity"], reverse=True
    )[:10]

    result = {
        "similarity_score": round(final_similarity, 4),
        "ai_probability": round(ai_prob, 4),
        "matches": top_matches
    }

    # cache result for faster subsequent reads
    try:
        cache_result(request.assignment_id, request.submission_id, result)
    except Exception:
        pass

    # return response in same shape as before
    return PlagiarismResponse(
        similarity_score=result["similarity_score"],
        ai_probability=result["ai_probability"],
        matches=[MatchItem(**m) for m in result["matches"]]
    )

# ----------- Endpoint: highlight PDF (keeps same contract) -----------
# ----------- Endpoint: highlight PDF (Improved) -----------
@app.post("/highlight_pdf")
def highlight_pdf(request: HighlightRequest = Body(...)):
    if not request.file_url:
        raise HTTPException(status_code=400, detail="file_url is required")

    # Fetch PDF content
    try:
        resp = requests.get(request.file_url, timeout=30)
        resp.raise_for_status()
        pdf_content = resp.content
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch PDF: {e}")

    try:
        doc = fitz.open(stream=pdf_content, filetype="pdf")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Invalid PDF: {e}")

    # Extract words per page with positions
    words_per_page = []
    for page_idx, page in enumerate(doc):
        try:
            words = page.get_text("words")
            words.sort(key=lambda w: (w[1], w[0]))  # sort by y, then x
            # PyMuPDF words: [x0, y0, x1, y1, "word", block_no, line_no, word_no]
            page_words = [{
                "page_idx": page_idx,
                "coords": w[:4],
                "text": w[4]
            } for w in words]
            words_per_page.append(page_words)
        except Exception:
            words_per_page.append([])

    # DB connection for plagiarism check
    conn, cur = None, None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
    except Exception as e:
        print("DB error in highlight_pdf:", e)

    # Sliding window parameters
    WINDOW_SIZE = 30  # words per span
    STEP_SIZE = 15    # overlap

    # Highlighting helper
    def highlight_word_span(page, span_words, color):
        for w in span_words:
            try:
                annot = page.add_highlight_annot(w["coords"])
                annot.set_colors(stroke=color)
                annot.update()
            except Exception:
                continue

    # Process each page
    for page_idx, page_words in enumerate(words_per_page):
        if not page_words:
            continue

        total_words = len(page_words)
        for start in range(0, total_words, STEP_SIZE):
            end = min(start + WINDOW_SIZE, total_words)
            span_words = page_words[start:end]
            span_text = " ".join([w["text"] for w in span_words])

            # Skip very small spans
            if len(span_text.strip()) < 10:
                continue

            # AI Probability
            ai_prob = 0.0
            try:
                ai_prob = detect_ai_probability(span_text)
            except Exception as e:
                print("AI detection error in highlight:", e)

            # Plagiarism similarity
            plag_score = 0.0
            try:
                emb = similarity_model.encode([span_text], convert_to_numpy=True, show_progress_bar=False)[0].tolist()
                if cur:
                    cur.execute(
                        'SELECT MAX(1 - (sc.embedding_mpnet <=> %s::vector)) '
                        'FROM "SubmissionChunk" sc '
                        'WHERE sc."submissionId" != %s',
                        (emb, request.submission_id or "")
                    )
                    val = cur.fetchone()
                    plag_score = float(val[0]) if val and val[0] is not None else 0.0
            except Exception as e:
                print("Plagiarism check error in highlight:", e)

            # Color based on type
            color = None
            if ai_prob >= AI_THRESHOLD and plag_score >= PLAG_THRESHOLD:
                color = (0.5, 0, 0.5)  # purple = AI + plagiarized
            elif ai_prob >= AI_THRESHOLD:
                color = (0, 0, 1)      # blue = AI generated
            elif plag_score >= PLAG_THRESHOLD:
                color = (1, 0, 0)      # red = plagiarized

            if color:
                page = doc[page_idx]
                highlight_word_span(page, span_words, color)

    if cur:
        cur.close()
    if conn:
        release_db_connection(conn)

    # Save highlighted PDF to memory
    pdf_bytes = io.BytesIO()
    doc.save(pdf_bytes)
    doc.close()
    pdf_bytes.seek(0)

    return StreamingResponse(
        pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=highlighted.pdf"}
    )

# ----------- Simple health endpoint -----------
@app.get("/health")
def health():
    return {"status": "ok"}
