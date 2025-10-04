# main.py (patched - normalized reranker & similarity handling)
import os
import io
import json
import re
import statistics
import requests
import fitz  # PyMuPDF
import nltk
from fastapi import FastAPI, HTTPException, Body
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from sentence_transformers import CrossEncoder
from transformers import pipeline, AutoTokenizer, AutoModelForCausalLM
from typing import List, Optional
from functools import lru_cache
import concurrent.futures
import redis
from dotenv import load_dotenv
import psycopg2
from psycopg2 import pool
from pgvector.psycopg2 import register_vector
import torch
import math

load_dotenv()

# ---------- Config ----------
DATABASE_URL = os.getenv("DATABASE_URL")
REDIS_URL = os.getenv("REDIS_URL", "")
PORT = int(os.getenv("AI_SERVICE_PORT", 8000))

# chunk sizes (words)
CHUNK_SIZE_WORDS = int(os.getenv("CHUNK_SIZE_WORDS", 250))
CHUNK_OVERLAP_WORDS = int(os.getenv("CHUNK_OVERLAP_WORDS", 50))
TOP_K = int(os.getenv("TOP_K", 5))

# models & weights
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-mpnet-base-v2")
CROSS_ENCODER_MODEL = os.getenv("CROSS_ENCODER_MODEL", "cross-encoder/ms-marco-MiniLM-L-6-v2")
DETECTOR_MODELS = os.getenv("DETECTOR_MODELS", "Hello-SimpleAI/chatgpt-detector-roberta,roberta-base-openai-detector").split(",")
DETECTOR_WEIGHTS = [float(x) for x in os.getenv("DETECTOR_WEIGHTS", "").split(",") if x.strip()] or None

# perplexity / DetectGPT proxy
ENABLE_PERPLEXITY = os.getenv("ENABLE_PERPLEXITY", "false").lower() == "true"
PERPLEXITY_MODEL = os.getenv("PERPLEXITY_MODEL", "gpt2")
PERP_MIN = float(os.getenv("PERP_MIN", "5.0"))
PERP_MAX = float(os.getenv("PERP_MAX", "200.0"))
PERPLEXITY_WEIGHT = float(os.getenv("PERPLEXITY_WEIGHT", "0.5"))  # contribution in ensemble (0..1)

# thresholds for highlights
AI_THRESHOLD = float(os.getenv("AI_THRESHOLD", 0.5))
PLAG_THRESHOLD = float(os.getenv("PLAG_THRESHOLD", 0.6))

# debug toggle
DEBUG_SIM = os.getenv("DEBUG_SIM", "false").lower() == "true"

# ---------- NLTK setup ----------
try:
    nltk.data.find("tokenizers/punkt")
except Exception:
    nltk.download("punkt")

app = FastAPI(title="AI-Powered Classroom - AI Service (Enhanced)")

# ---------- Redis (optional) ----------
redis_client = None
if REDIS_URL:
    try:
        redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
        redis_client.ping()
        print("Redis connected")
    except Exception as e:
        print("Redis connect failed:", e)
        redis_client = None

# ---------- DB pool ----------
db_pool = None
if DATABASE_URL:
    try:
        db_pool = pool.SimpleConnectionPool(1, 10, DATABASE_URL)
        conn_temp = db_pool.getconn()
        try:
            register_vector(conn_temp)
        finally:
            db_pool.putconn(conn_temp)
        print("DB pool ready")
    except Exception as e:
        print("DB pool error:", e)
        db_pool = None

def get_db_connection():
    if not db_pool:
        raise RuntimeError("DB pool not initialized")
    conn = db_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1;")
    except Exception:
        try:
            db_pool.putconn(conn, close=True)
        except Exception:
            pass
        conn = db_pool.getconn()
    return conn

def release_db_connection(conn):
    if db_pool and conn:
        db_pool.putconn(conn)

# ---------- Models (lazy loads) ----------
@lru_cache(maxsize=1)
def load_embedding_model():
    print("Loading embedding model:", EMBEDDING_MODEL)
    model = SentenceTransformer(EMBEDDING_MODEL)
    return model

similarity_model = load_embedding_model()

# cross-encoder reranker (optional)
cross_reranker = None
try:
    print("Loading cross-encoder:", CROSS_ENCODER_MODEL)
    cross_reranker = CrossEncoder(CROSS_ENCODER_MODEL)
    print("Cross-encoder loaded")
except Exception as e:
    print("Cross-encoder load failed:", e)
    cross_reranker = None

# HF detectors (optional)
detector_pipelines = []
for name in DETECTOR_MODELS:
    name = name.strip()
    if not name:
        continue
    try:
        print("Loading detector:", name)
        det = pipeline("text-classification", model=name, truncation=True)
        detector_pipelines.append((name, det))
    except Exception as e:
        print("Detector load failed:", name, e)

print("Detectors:", [n for n,_ in detector_pipelines])

# perplexity model (optional)
perp_tokenizer = None
perp_model = None
perp_device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
if ENABLE_PERPLEXITY:
    try:
        print("Loading perplexity model:", PERPLEXITY_MODEL)
        perp_tokenizer = AutoTokenizer.from_pretrained(PERPLEXITY_MODEL, use_fast=True)
        perp_model = AutoModelForCausalLM.from_pretrained(PERPLEXITY_MODEL).to(perp_device)
        perp_model.eval()
        print("Perplexity model ready on", perp_device)
    except Exception as e:
        print("Perplexity load failed:", e)
        perp_tokenizer = None
        perp_model = None

# ---------- Utilities ----------
def _cache_key_for_check(assignment_id: str, submission_id: str):
    return f"plagiarism:{assignment_id}:{submission_id}"

def cache_result(assignment_id: str, submission_id: str, result: dict, ttl_seconds: int = 3600):
    if not redis_client: return
    try:
        redis_client.setex(_cache_key_for_check(assignment_id, submission_id), ttl_seconds, json.dumps(result))
    except Exception as e:
        print("Redis set failed:", e)

def get_cached_result(assignment_id: str, submission_id: str):
    if not redis_client: return None
    try:
        raw = redis_client.get(_cache_key_for_check(assignment_id, submission_id))
        if raw:
            return json.loads(raw)
    except Exception as e:
        print("Redis get failed:", e)
    return None

# helper: clamp to [0,1]
def clamp01(x):
    try:
        v = float(x)
        if v != v:  # NaN check
            return 0.0
        return max(0.0, min(1.0, v))
    except Exception:
        return 0.0

# helper: normalize cross-encoder scores robustly
# - if all scores already in [0,1], keep them as-is
# - otherwise apply sigmoid to map arbitrary real scores to (0,1)
def normalize_scores(scores):
    normalized = []
    # convert to floats and handle None
    floats = []
    for s in scores:
        try:
            floats.append(float(s))
        except Exception:
            floats.append(0.0)
    # if all in [0,1], treat as probabilities already
    if all(0.0 <= v <= 1.0 for v in floats):
        return [clamp01(v) for v in floats]
    # otherwise use sigmoid mapping
    for v in floats:
        try:
            nv = 1.0 / (1.0 + math.exp(-v))
            normalized.append(clamp01(nv))
        except Exception:
            normalized.append(0.0)
    return normalized

# chunking with char offsets
def chunk_text_with_char_indices(text: str, chunk_size: int = CHUNK_SIZE_WORDS, overlap: int = CHUNK_OVERLAP_WORDS):
    # find tokens as sequences of non-space characters (keeps punctuation)
    matches = list(re.finditer(r'\S+', text))
    words = [(m.group(0), m.start(), m.end()) for m in matches]
    if not words:
        return []
    step = max(chunk_size - overlap, 1)
    chunks = []
    idx = 0
    chunk_index = 0
    while idx < len(words):
        window = words[idx: idx + chunk_size]
        if not window:
            break
        chunk_text = " ".join([w[0] for w in window])
        start_char = window[0][1]
        end_char = window[-1][2]
        chunks.append({
            "index": chunk_index,
            "text": chunk_text,
            "start_char": start_char,
            "end_char": end_char,
            "word_count": len(window)
        })
        chunk_index += 1
        idx += step
    return chunks

# mapping small helper: try to find first-n token match on page tokens
def find_chunk_on_page(chunk_tokens, page_tokens, start_guess=0, first_n=8):
    ft = min(first_n, len(chunk_tokens))
    prefix = chunk_tokens[:ft]
    # convert to simple lower-case match
    for i in range(0, max(0, len(page_tokens) - ft + 1)):
        if page_tokens[i:i+ft] == prefix:
            # matched prefix; assume the rest follows contiguously (best-effort)
            end_idx = min(len(page_tokens), i + len(chunk_tokens))
            return i, end_idx
    return None, None

# ---------- Perplexity helper ----------
def compute_proxy_perplexity(text: str):
    """Return an approximate avg token loss and perp if model loaded, else None."""
    if not perp_model or not perp_tokenizer:
        return None
    try:
        inputs = perp_tokenizer(text, return_tensors="pt", truncation=True, max_length=1024).to(perp_device)
        with torch.no_grad():
            outputs = perp_model(**inputs, labels=inputs["input_ids"])
        avg_loss = float(outputs.loss.cpu().item())
        perp = float(torch.exp(torch.tensor(outputs.loss)).cpu().item())
        return {"avg_loss": avg_loss, "perplexity": perp}
    except Exception as e:
        print("Perplexity compute error:", e)
        return None

def perp_to_prob(perp_value: float, min_perp: float = PERP_MIN, max_perp: float = PERP_MAX):
    # lower perplexity under the same LM => higher chance AI-generated.
    # Map perp_value to [0,1] with clipping (simple linear mapping).
    if perp_value is None:
        return 0.0
    clamped = max(min_perp, min(max_perp, perp_value))
    # probability that text is AI (lower perp -> higher prob)
    prob = (max_perp - clamped) / max(1.0, (max_perp - min_perp))
    return float(max(0.0, min(1.0, prob)))

# ---------- Detector ensemble ----------
def detect_ai_probability_chunk(text: str):
    """
    Single-chunk AI probability in [0,1].
    Uses HF detectors (if available) + optional perplexity proxy.
    Returns combined weighted probability.
    """
    scores = []
    weights = []
    # detectors
    if detector_pipelines:
        for i, (name, det) in enumerate(detector_pipelines):
            try:
                out = det(text[:2048])  # safe truncation
                if isinstance(out, list) and out:
                    top = out[0]
                    label = (top.get("label") or "").lower()
                    score = float(top.get("score", 0.0))
                    # heuristics mapping
                    if "fake" in label or "machine" in label or "ai" in label:
                        p = score
                    elif "real" in label or "human" in label:
                        p = 1.0 - score
                    else:
                        p = score
                    scores.append(p)
                    weights.append(1.0)
            except Exception as e:
                print("Detector error:", name, e)
                continue

    # perplexity
    perp_score = 0.0
    if ENABLE_PERPLEXITY and perp_model:
        perp_res = compute_proxy_perplexity(text)
        if perp_res:
            perp = perp_res.get("perplexity")
            perp_score = perp_to_prob(perp)
            scores.append(perp_score)
            weights.append(PERPLEXITY_WEIGHT)

    if not scores:
        return 0.0
    # if explicit detector weights provided, use them (must match number of detectors used)
    if DETECTOR_WEIGHTS and len(DETECTOR_WEIGHTS) == len(scores):
        w = DETECTOR_WEIGHTS
    else:
        w = weights if any(weights) else [1.0] * len(scores)
    # normalize
    total_w = sum(w) if sum(w) > 0 else 1.0
    combined = sum(s * ww for s, ww in zip(scores, w)) / total_w
    return float(max(0.0, min(1.0, combined)))

def aggregate_chunk_probs(chunk_probs: List[float], weights: Optional[List[float]] = None, top_k: int = 3):
    if not chunk_probs:
        return 0.0
    if weights is None:
        weights = [1.0] * len(chunk_probs)
    weighted = sorted([p * w for p, w in zip(chunk_probs, weights)], reverse=True)
    top = weighted[:top_k]
    prod = 1.0
    for p in top:
        prod *= (1.0 - p)
    return float(1.0 - prod)

# ---------- Pydantic models ----------
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

# ---------- Main endpoints ----------
@app.post("/check", response_model=PlagiarismResponse)
def check_plagiarism(request: PlagiarismRequest):
    # try cache
    cached = None
    try:
        cached = get_cached_result(request.assignment_id, request.submission_id)
    except Exception:
        cached = None
    if cached:
        return PlagiarismResponse(**cached)

    # fetch content
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

    # chunk document (with char offsets)
    chunks = chunk_text_with_char_indices(submission_text, CHUNK_SIZE_WORDS, CHUNK_OVERLAP_WORDS)
    if not chunks:
        result = {"similarity_score": 0.0, "ai_probability": 0.0, "matches": []}
        cache_result(request.assignment_id, request.submission_id, result)
        return PlagiarismResponse(**result)

    # compute embeddings for chunks and doc
    try:
        chunk_texts = [c["text"] for c in chunks]
        embeddings_chunks = similarity_model.encode(chunk_texts, convert_to_numpy=True, show_progress_bar=False)
        embedding_doc = similarity_model.encode([submission_text], convert_to_numpy=True, show_progress_bar=False)[0]
    except Exception as e:
        print("Embedding error:", e)
        raise HTTPException(status_code=500, detail=f"Embedding model failed: {e}")

    # open DB connection
    conn = get_db_connection()
    cur = conn.cursor()
    match_best = {}

    # compute per-chunk AI score and plagiarism score (using vector search + optional cross-encoder rerank)
    try:
        for i, c in enumerate(chunks):
            chunk_text = c["text"]
            # ai score (per chunk)
            try:
                ai_score = detect_ai_probability_chunk(chunk_text)
            except Exception as e:
                print("AI detect error for chunk:", e)
                ai_score = 0.0
            c["ai_score"] = clamp01(ai_score)

            # plagiarism (vector search)
            plag_score = 0.0
            try:
                emb = embeddings_chunks[i].tolist()
                cur.execute(
                    'SELECT sc."submissionId", sc.content, 1 - (sc.embedding_mpnet <=> %s::vector) AS similarity '
                    'FROM "SubmissionChunk" sc '
                    'JOIN "Submission" s ON sc."submissionId" = s.id '
                    'WHERE sc."submissionId" != %s AND s."assignmentId" = %s '
                    'ORDER BY similarity DESC LIMIT %s',
                    (emb, request.submission_id, request.assignment_id, TOP_K)
                )
                rows = cur.fetchall()
                if rows:
                    # initial sim list
                    candidates = []
                    for r in rows:
                        sid, candidate_text, sim = r[0], r[1], float(r[2])
                        sim = clamp01(sim)   # clamp to [0,1] immediately
                        candidates.append({"submission_id": sid, "candidate_text": candidate_text, "sim": sim})
                    # rerank with cross-encoder if available
                    if cross_reranker:
                        pairs = [[chunk_text, cand["candidate_text"]] for cand in candidates]
                        try:
                            scores = cross_reranker.predict(pairs, show_progress_bar=False)
                            if scores is None:
                                scores = [0.0] * len(candidates)
                            norm_scores = normalize_scores(scores)
                            # take best normalized score
                            best = max(norm_scores) if norm_scores else 0.0
                            plag_score = float(best)
                            # update match_best using the stronger of normalized rerank score and raw vector sim
                            for j, cand in enumerate(candidates):
                                sid = cand["submission_id"]
                                rnorm = norm_scores[j] if j < len(norm_scores) else 0.0
                                combined = max(rnorm, cand["sim"])
                                if combined > match_best.get(sid, 0.0):
                                    match_best[sid] = combined
                        except Exception as e:
                            # fallback to vector similarity
                            plag_score = max(c["sim"] for c in candidates)
                            for cand in candidates:
                                sid = cand["submission_id"]
                                simv = cand["sim"]
                                if simv > match_best.get(sid, 0.0):
                                    match_best[sid] = simv
                    else:
                        # no reranker: use raw sim
                        plag_score = max(c["sim"] for c in candidates)
                        for cand in candidates:
                            sid = cand["submission_id"]
                            simv = cand["sim"]
                            if simv > match_best.get(sid, 0.0):
                                match_best[sid] = simv
            except Exception as e:
                print("Plag check error for chunk:", e)
                plag_score = 0.0
            c["plag_score"] = clamp01(plag_score)

        # Document-level search (embedding of full doc)
        doc_top_mean = 0.0
        try:
            doc_list = embedding_doc.tolist()
            cur.execute(
                'SELECT sc."submissionId", sc.content, 1 - (sc.embedding_mpnet <=> %s::vector) AS similarity '
                'FROM "SubmissionChunk" sc '
                'JOIN "Submission" s ON sc."submissionId" = s.id '
                'WHERE sc."submissionId" != %s AND s."assignmentId" = %s '
                'ORDER BY similarity DESC LIMIT %s',
                (doc_list, request.submission_id, request.assignment_id, TOP_K)
            )
            doc_rows = cur.fetchall()
            if doc_rows:
                # clamp raw DB similarities
                raw_sims = [clamp01(float(r[2])) for r in doc_rows]
                if cross_reranker:
                    pairs = [[submission_text, r[1]] for r in doc_rows]
                    try:
                        scores = cross_reranker.predict(pairs, show_progress_bar=False)
                        if scores is None:
                            scores = [0.0] * len(doc_rows)
                        norm_scores = normalize_scores(scores)
                        # update match_best using normalized reranker OR raw sim, whichever is stronger
                        for j, r in enumerate(doc_rows):
                            sid = r[0]
                            val = norm_scores[j] if j < len(norm_scores) else raw_sims[j]
                            combined = max(raw_sims[j], val)
                            if combined > match_best.get(sid, 0.0):
                                match_best[sid] = combined
                        # doc_top_mean: mean of combined normalized signals
                        combined_list = [max(raw_sims[i], (norm_scores[i] if i < len(norm_scores) else 0.0)) for i in range(len(doc_rows))]
                        doc_top_mean = statistics.mean(combined_list) if combined_list else 0.0
                    except Exception as e:
                        doc_top_mean = statistics.mean(raw_sims) if raw_sims else 0.0
                else:
                    doc_top_mean = statistics.mean(raw_sims) if raw_sims else 0.0
        except Exception as e:
            print("Doc-level similarity error:", e)
            doc_top_mean = 0.0

        # Bulk insert chunks (document + chunks) with ai_score, plag_score and offsets
        insert_params = []
        # document row (index -1)
        doc_row = (submission_text, embedding_doc.tolist(), request.submission_id, -1, 0, len(submission_text), 0.0, 0.0)
        # prepare: (content, embedding, submissionId, chunk_index, start_char, end_char, ai_score, plag_score)
        insert_params.append(doc_row)
        for i, c in enumerate(chunks):
            emb_list = embeddings_chunks[i].tolist()
            ai_val = clamp01(c.get("ai_score", 0.0))
            plag_val = clamp01(c.get("plag_score", 0.0))
            insert_params.append((c["text"], emb_list, request.submission_id, c["index"], c["start_char"], c["end_char"], ai_val, plag_val))

        cur.executemany(
            'INSERT INTO "SubmissionChunk" (id, content, embedding_mpnet, "submissionId", chunk_index, start_char, end_char, ai_score, plag_score, "createdAt") '
            'VALUES (gen_random_uuid(), %s, %s::vector, %s, %s, %s, %s, %s, %s, NOW())',
            insert_params
        )

        conn.commit()

    except Exception as e:
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
    final_similarity = max(all_match_values + [doc_top_mean]) if (match_best or doc_top_mean) else 0.0

    # ensure final similarity capped to [0,1]
    final_similarity = clamp01(final_similarity)

    # aggregate AI probability across chunks
    chunk_ai_probs = [float(c.get("ai_score", 0.0)) for c in chunks]
    doc_ai_prob = aggregate_chunk_probs(chunk_ai_probs, top_k=3)
    doc_ai_prob = clamp01(doc_ai_prob)

    # top matches list
    top_matches = sorted(
        [{"submission_id": sid, "similarity": sim} for sid, sim in match_best.items()],
        key=lambda x: x["similarity"], reverse=True
    )[:10]

    result = {
        "similarity_score": round(float(final_similarity), 4),
        "ai_probability": round(float(doc_ai_prob), 4),
        "matches": top_matches
    }

    if DEBUG_SIM:
        try:
            print("DEBUG similarity:", {"match_best_sample": dict(list(match_best.items())[:5]), "doc_top_mean": doc_top_mean, "final_similarity": final_similarity, "ai_prob": doc_ai_prob})
        except Exception:
            pass

    try:
        cache_result(request.assignment_id, request.submission_id, result)
    except Exception:
        pass

    return PlagiarismResponse(
        similarity_score=result["similarity_score"],
        ai_probability=result["ai_probability"],
        matches=[MatchItem(**m) for m in result["matches"]]
    )

# ---------- PDF helpers ----------
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

@app.post("/highlight_pdf")
def highlight_pdf(request: HighlightRequest = Body(...)):
    if not request.file_url and not request.submission_id:
        raise HTTPException(status_code=400, detail="file_url or submission_id is required")

    # fetch pdf
    try:
        resp = requests.get(request.file_url, timeout=30) if request.file_url else requests.get("")  # placeholder if file_url not used
        if request.file_url:
            resp.raise_for_status()
            pdf_content = resp.content
        else:
            raise HTTPException(status_code=400, detail="file_url required for highlight endpoint in current implementation")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch PDF: {e}")

    try:
        doc = fitz.open(stream=pdf_content, filetype="pdf")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Invalid PDF: {e}")

    # extract page words & coords
    words_per_page = []
    for page_idx, page in enumerate(doc):
        try:
            words = page.get_text("words")
            words.sort(key=lambda w: (w[1], w[0]))  # sort by y then x
            page_words = [{"page_idx": page_idx, "coords": w[:4], "text": w[4]} for w in words]
            words_per_page.append(page_words)
        except Exception:
            words_per_page.append([])

    # fetch per-chunk cached scores from DB for this submission
    conn, cur = None, None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            'SELECT content, ai_score, plag_score, chunk_index, start_char, end_char '
            'FROM "SubmissionChunk" WHERE "submissionId" = %s ORDER BY chunk_index ASC',
            (request.submission_id,)
        )
        rows = cur.fetchall()
        chunks = [{"text": r[0], "ai_score": float(r[1] or 0.0), "plag_score": float(r[2] or 0.0), "index": r[3], "start_char": r[4], "end_char": r[5]} for r in rows] if rows else []
    except Exception as e:
        print("DB error fetching cached chunks for highlight:", e)
        chunks = []
    finally:
        if cur:
            cur.close()
        if conn:
            release_db_connection(conn)

    # highlight helper
    def highlight_word_span(page_obj, span_words, color):
        for w in span_words:
            try:
                annot = page_obj.add_highlight_annot(w["coords"])
                annot.set_colors(stroke=color)
                annot.update()
            except Exception:
                continue

    # map each chunk to page tokens & highlight (best-effort)
    for chunk in chunks:
        chunk_tokens = [t.lower() for t in re.findall(r'\S+', chunk["text"])]
        if not chunk_tokens:
            continue
        matched_any = False
        remaining = chunk_tokens.copy()
        # attempt to find chunk across pages: for each page, search for first N tokens of remaining
        for page_idx, page_words in enumerate(words_per_page):
            if not page_words:
                continue
            page_tokens = [w["text"].lower() for w in page_words]
            # find prefix match of remaining chunk tokens in this page
            i, end_i = find_chunk_on_page(remaining, page_tokens, first_n=8)
            if i is not None:
                matched_any = True
                # compute highlighted span length (best effort: use size of remaining or page remainder)
                span_len = min(len(remaining), len(page_tokens) - i)
                span_words = page_words[i: i + span_len]
                # color logic
                color = None
                ai_p = clamp01(float(chunk.get("ai_score", 0.0)))
                plag_p = clamp01(float(chunk.get("plag_score", 0.0)))
                if ai_p >= AI_THRESHOLD and plag_p >= PLAG_THRESHOLD:
                    color = (0.5, 0, 0.5)  # purple
                elif ai_p >= AI_THRESHOLD:
                    color = (0, 0, 1)      # blue
                elif plag_p >= PLAG_THRESHOLD:
                    color = (1, 0, 0)      # red
                if color:
                    page = doc[page_idx]
                    highlight_word_span(page, span_words, color)
                # remove matched tokens from remaining
                remaining = remaining[span_len:]
                if not remaining:
                    break

    # save pdf to bytes
    pdf_bytes = io.BytesIO()
    doc.save(pdf_bytes)
    doc.close()
    pdf_bytes.seek(0)
    return StreamingResponse(pdf_bytes, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=highlighted.pdf"})

@app.get("/health")
def health():
    return {"status": "ok"}
