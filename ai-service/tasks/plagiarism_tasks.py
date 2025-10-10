# ai-service/tasks/plagiarism_tasks.py
# Robust plagiarism check + highlighted-pdf generator with detailed debug logging.

import os
import sys
import io
import json
import traceback

# make sure we can import modules stored under backend/src (vector_index, etc.)
PROJECT_ROOT = os.path.dirname(os.path.dirname(__file__))  # ai-service/tasks/.. -> ai-service
SYS_EXTRA = os.path.join(PROJECT_ROOT, "backend", "src")
if SYS_EXTRA not in sys.path:
    sys.path.append(SYS_EXTRA)

# common libs
try:
    import fitz  # PyMuPDF
except Exception:
    fitz = None

try:
    import requests
except Exception:
    requests = None

try:
    import boto3
except Exception:
    boto3 = None

try:
    from backend.src.vector_index import VectorIndex
except Exception:
    VectorIndex = None

try:
    from bm25_cache import get_or_build_bm25
except Exception:
    get_or_build_bm25 = None

try:
    from fusion import predict_fused_score, jaccard_char_trigrams
except Exception:
    def jaccard_char_trigrams(a: str, b: str) -> float:
        a, b = (a or "").lower(), (b or "").lower()
        def trigrams(s):
            s2 = s.replace(" ", "")
            return set(s2[i:i+3] for i in range(len(s2)-2)) if len(s2) >= 3 else {s2}
        A, B = trigrams(a), trigrams(b)
        return len(A & B) / len(A | B) if A and B else 0.0

    def predict_fused_score(features):
        try:
            return float(features[3]) if len(features) > 3 else 0.0
        except Exception:
            return 0.0

try:
    from ai_detector import detect_ai_probability
except Exception:
    def detect_ai_probability(text): return 0.0

try:
    from celery import shared_task
except Exception:
    def shared_task(*a, **k):
        def deco(f): return f
        return deco


def _debug(msg, *args):
    try:
        print("[plagiarism_tasks]", msg.format(*args))
    except Exception:
        print("[plagiarism_tasks] DEBUG:", msg, args)


def extract_text_from_pdf_bytes(pdf_bytes: bytes) -> str:
    if not fitz:
        return ""
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        return "\n".join(p.get_text("text") for p in doc)
    except Exception as e:
        _debug("extract_text_from_pdf_bytes failed: {}", e)
        return ""


def fetch_via_http(url: str) -> bytes | None:
    if not requests:
        return None
    try:
        r = requests.get(url, timeout=30)
        if r.status_code == 200:
            return r.content
    except Exception as e:
        _debug("requests.get failed for url={} error={}", url, e)
    return None


def fetch_via_s3(url: str) -> bytes | None:
    if not boto3:
        return None
    try:
        s3 = boto3.client("s3")
        if url.startswith("s3://"):
            _, rest = url.split("s3://", 1)
            bucket, key = rest.split("/", 1)
            return s3.get_object(Bucket=bucket, Key=key)["Body"].read()
        if "s3.amazonaws.com" in url:
            parts = url.split("s3.amazonaws.com/")[-1]
            if "/" in parts:
                bucket, key = parts.split("/", 1)
                return s3.get_object(Bucket=bucket, Key=key)["Body"].read()
    except Exception as e:
        _debug("boto3 get_object failed for url={} err={}", url, e)
    return None


def ensure_text(text_content: str, file_url: str) -> str:
    if text_content:
        return text_content
    if file_url:
        _debug("No text_content provided. Attempting to fetch file_url={}", file_url)
        b = fetch_via_http(file_url)
        if b:
            txt = extract_text_from_pdf_bytes(b)
            if txt.strip():
                _debug("Extracted text from HTTP fetch (len={})", len(txt))
                return txt
        b = fetch_via_s3(file_url)
        if b:
            txt = extract_text_from_pdf_bytes(b)
            if txt.strip():
                _debug("Extracted text from S3 fetch (len={})", len(txt))
                return txt
        _debug("Failed to extract text from file_url.")
    return ""


def run_check(submission_id, assignment_id=None, text_content=None, file_url=None, top_k=5):
    try:
        _debug("run_check called submission_id={} assignment_id={} text_len={} file_url={}",
               submission_id, assignment_id, len(text_content or ""), file_url)

        text = ensure_text(text_content, file_url)
        if not text.strip():
            _debug("No text available after extraction; returning zero similarity.")
            return {"similarity_score": 0.0, "ai_probability": 0.0, "matches": []}

        # ----------------------------
        # 🧠 Step 1: AI probability
        # ----------------------------
        ai_prob = 0.0
        try:
            ai_prob = float(detect_ai_probability(text))
        except Exception as e:
            _debug("ai_detector failed: {}", e)

        candidates = []

        # ----------------------------
        # 🔍 Step 2: FAISS Search
        # ----------------------------
        try:
            if VectorIndex is not None:
                vi = VectorIndex()
                vi.load()

                if getattr(vi, "index", None) is not None and getattr(vi, "meta", None):
                    _debug("✅ FAISS index loaded with {} meta entries", len(vi.meta))

                    import numpy as np

                    # 🧩 Encode and normalize embedding
                    q_emb = vi.model.encode([text], convert_to_numpy=True)
                    if q_emb.ndim == 1:
                        q_emb = np.expand_dims(q_emb, axis=0)

                    q_emb = q_emb.astype("float32")
                    faiss.normalize_L2(q_emb)

                    _debug("Encoded query shape {} dtype={}", q_emb.shape, q_emb.dtype)

                    # 🧭 Search the FAISS index
                    D, I = vi.index.search(q_emb, top_k)
                    _debug("FAISS search results: D={}, I={}", D.tolist(), I.tolist())

                    for dist, idx in zip(D[0], I[0]):
                        if idx < len(vi.meta):
                            sim = float(1 - dist)
                            sid = vi.meta[idx].get("submission_id", f"id_{idx}")
                            candidates.append({"submission_id": sid, "score": sim})

                    _debug("FAISS candidates found: {}", len(candidates))
                else:
                    _debug("FAISS index not loaded or meta missing.")
        except Exception as e:
            _debug("VectorIndex encode/search failed: {}", e)
            _debug(traceback.format_exc())

        # ----------------------------
        # 📚 Step 3: BM25 / S3 fallback
        # ----------------------------
        if not candidates:
            _debug("No FAISS results; trying fallback (BM25/S3).")
            try:
                if get_or_build_bm25:
                    bm25_obj, meta = get_or_build_bm25(assignment_id, {})
                    if bm25_obj and meta:
                        _debug("BM25 fallback meta entries: {}", len(meta.get("docs", [])))
            except Exception as e:
                _debug("get_or_build_bm25 failed: {}", e)

        if not candidates:
            s3_bucket = os.getenv("AWS_S3_BUCKET_NAME") or os.getenv("S3_BUCKET_NAME")
            if s3_bucket and boto3:
                try:
                    s3 = boto3.client("s3")
                    resp = s3.list_objects_v2(Bucket=s3_bucket, Prefix=f"{assignment_id or ''}")
                    items = resp.get("Contents", [])[:50]
                    best = []
                    for obj in items:
                        key = obj["Key"]
                        if "highlighted/" in key:
                            continue
                        o = s3.get_object(Bucket=s3_bucket, Key=key)
                        other_text = extract_text_from_pdf_bytes(o["Body"].read())
                        score = jaccard_char_trigrams(text, other_text)
                        best.append((key, score))
                    best.sort(key=lambda x: x[1], reverse=True)
                    for k, s in best[:top_k]:
                        candidates.append({"submission_id": k, "score": float(s)})
                    _debug("S3 fallback compared {} objects, found {} candidates", len(best), len(candidates))
                except Exception as e:
                    _debug("S3 scanning fallback failed: {}", e)

        # ----------------------------
        # 🎯 Step 4: Fusion scoring
        # ----------------------------
        matches, best_similarity = [], 0.0
        if candidates:
            for c in sorted(candidates, key=lambda x: x["score"], reverse=True)[:top_k]:
                sid = c["submission_id"]
                faiss_score = float(c["score"])
                features = [faiss_score, faiss_score, 0.0, faiss_score, ai_prob]
                fused = predict_fused_score(features)
                sim_final = float(fused or faiss_score)
                matches.append({"submission_id": sid, "similarity": sim_final})
                best_similarity = max(best_similarity, sim_final)
            _debug("Top matches prepared: {}", json.dumps(matches[:5]))
        else:
            _debug("No candidates found; returning similarity 0.0")

        # ----------------------------
        # ✅ Step 5: Final result
        # ----------------------------
        return {
            "similarity_score": float(best_similarity),
            "ai_probability": float(ai_prob),
            "matches": matches
        }

    except Exception as e:
        _debug("run_check top-level exception: {}", e)
        _debug(traceback.format_exc())
        return {"similarity_score": 0.0, "ai_probability": 0.0, "matches": []}


def generate_highlighted_pdf(file_url, submission_id=None, assignment_id=None):
    try:
        _debug("generate_highlighted_pdf called file_url={}", file_url)
        b = fetch_via_http(file_url) or fetch_via_s3(file_url)
        if not b or not fitz:
            return b""
        doc = fitz.open(stream=b, filetype="pdf")
        text_all = "\n".join(p.get_text("text") for p in doc)
        words = [w.lower() for w in text_all.split() if len(w) > 3]
        from collections import Counter
        top_words = [w for w,_ in Counter(words).most_common(5)]
        for page in doc:
            for w in top_words:
                for inst in page.search_for(w):
                    page.add_highlight_annot(inst)
        out = io.BytesIO()
        doc.save(out)
        _debug("Generated highlighted PDF bytes len={}", out.getbuffer().nbytes)
        return out.getvalue()
    except Exception as e:
        _debug("generate_highlighted_pdf exception: {}", e)
        return b""


@shared_task(bind=True)
def process_submission_task(self, submission_id, assignment_id, file_url=None):
    res = run_check(submission_id, assignment_id, None, file_url)
    pdf = generate_highlighted_pdf(file_url, submission_id, assignment_id)
    return {"submission_id": submission_id, "result": res, "highlighted_pdf": bool(pdf)}
