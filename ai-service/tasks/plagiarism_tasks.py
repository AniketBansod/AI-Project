# ai-service/tasks/plagiarism_tasks.py
# Robust plagiarism check + highlighted-pdf generator with detailed debug logging.

import os
import sys
import io
import json
import traceback
import uuid
import time
from collections import OrderedDict

# make sure we can import modules stored under backend/src (vector_index, etc.)
PROJECT_ROOT = os.path.dirname(os.path.dirname(__file__))  # ai-service/tasks/.. -> ai-service
SYS_EXTRA = os.path.join(PROJECT_ROOT, "backend", "src")
if SYS_EXTRA not in sys.path:
    sys.path.append(SYS_EXTRA)

# common libs (lazy)
fitz = None  # PyMuPDF, loaded lazily
def _get_fitz():
    global fitz
    if fitz is not None:
        return fitz
    try:
        import fitz as _fitz  # type: ignore
        fitz = _fitz
    except Exception:
        fitz = None
    return fitz

try:
    import requests
except Exception:
    requests = None

try:
    import boto3
except Exception:
    boto3 = None

try:
    from backend.src.vector_index import get_vector_index
except Exception:
    get_vector_index = None

# Try to import faiss for proper L2 normalization; fallback to numpy if unavailable
try:
    import faiss  # type: ignore
except Exception:
    faiss = None

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

# Celery is no longer used. Keep code self-contained without task decorators.

# Optional DB lookup for submission -> assignment mapping when FAISS meta lacks assignment_id
_SUB_ASSIGN_CACHE: dict[str, str] = {}

class _TTLCache:
    def __init__(self, max_size=256, ttl_sec=900):
        self.max_size = max_size
        self.ttl_sec = ttl_sec
        self.store = OrderedDict()

    def get(self, key):
        now = time.time()
        item = self.store.get(key)
        if not item:
            return None
        exp, val = item
        if exp < now:
            try:
                del self.store[key]
            except Exception:
                pass
            return None
        self.store.move_to_end(key)
        return val

    def set(self, key, val):
        now = time.time()
        self.store[key] = (now + self.ttl_sec, val)
        self.store.move_to_end(key)
        while len(self.store) > self.max_size:
            try:
                self.store.popitem(last=False)
            except Exception:
                break

_small_cache = _TTLCache(max_size=256, ttl_sec=900)
def _get_db_conn():
    try:
        import psycopg2
        from psycopg2 import pool
        db_url = os.getenv("DATABASE_URL")
        if not db_url:
            return None
        # keep a single connection (simple and sufficient for this service)
        conn = getattr(_get_db_conn, "_conn", None)
        if conn is None or conn.closed:
            conn = psycopg2.connect(dsn=db_url)
            setattr(_get_db_conn, "_conn", conn)
        return conn
    except Exception:
        return None

def get_assignment_for_submission(submission_id: str) -> str | None:
    if not submission_id:
        return None
    hit = _small_cache.get(("sub_assign", submission_id))
    if hit is not None:
        return hit
    if submission_id in _SUB_ASSIGN_CACHE:
        return _SUB_ASSIGN_CACHE[submission_id]
    conn = _get_db_conn()
    if not conn:
        return None
    try:
        cur = conn.cursor()
        cur.execute('SELECT "assignmentId" FROM "Submission" WHERE id = %s LIMIT 1', (submission_id,))
        row = cur.fetchone()
        cur.close()
        if row and row[0]:
            _SUB_ASSIGN_CACHE[submission_id] = row[0]
            _small_cache.set(("sub_assign", submission_id), row[0])
            return row[0]
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
    return None


def _debug(msg, *args):
    try:
        print("[plagiarism_tasks]", msg.format(*args))
    except Exception:
        print("[plagiarism_tasks] DEBUG:", msg, args)


def extract_text_from_pdf_bytes(pdf_bytes: bytes) -> str:
    f = _get_fitz()
    if not f:
        return ""
    try:
        doc = f.open(stream=pdf_bytes, filetype="pdf")
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
        # 🔍 Step 2: FAISS Search (with assignment pre-filter)
        # ----------------------------
        try:
            if get_vector_index is not None:
                vi = get_vector_index()

                if getattr(vi, "index", None) is not None and getattr(vi, "meta", None):
                    _debug("✅ FAISS index loaded with {} meta entries", len(vi.meta))

                    # Pre-filter: if assignment_id is provided, ensure there are entries for this assignment
                    skip_faiss = False
                    if assignment_id:
                        # Tiny in-process cache to count entries per assignment
                        key = ("assign_count", assignment_id)
                        cnt = _small_cache.get(key)
                        # IMPORTANT: Don't trust cached zero; recompute to avoid stale 0 after incremental add
                        if cnt is None or cnt == 0:
                            try:
                                cnt = sum(1 for m in (vi.meta or []) if (m or {}).get("assignment_id") == assignment_id)
                            except Exception:
                                cnt = 0
                            # Only cache positive counts; avoid caching zero to prevent stale skips
                            if cnt > 0:
                                _small_cache.set(key, cnt)
                        if cnt == 0:
                            _debug("No entries for assignment {} in FAISS meta; skipping search.", assignment_id)
                            candidates = []
                            skip_faiss = True  # cleanly skip without raising

                    if not skip_faiss:
                        import numpy as np

                        # 🧩 Encode and normalize embedding
                        q_emb = vi.encode([text])
                        if q_emb.ndim == 1:
                            q_emb = np.expand_dims(q_emb, axis=0)

                        q_emb = q_emb.astype("float32")
                        try:
                            if faiss is not None:
                                faiss.normalize_L2(q_emb)
                            else:
                                q_emb /= (np.linalg.norm(q_emb, axis=1, keepdims=True) + 1e-12)
                        except Exception as ne:
                            _debug("Normalization failed: {}", ne)

                        _debug("Encoded query shape {} dtype={}", q_emb.shape, q_emb.dtype)

                        # Ensure query embedding dimension matches the FAISS index dimension
                        try:
                            index_dim = getattr(vi.index, 'd', None)
                        except Exception:
                            index_dim = None
                        if index_dim is not None and q_emb.shape[1] != index_dim:
                            _debug("⚠️ Query dim {} != index dim {}. Adapting...", q_emb.shape[1], index_dim)
                            if q_emb.shape[1] > index_dim:
                                q_emb = q_emb[:, :index_dim]
                            else:
                                import numpy as np
                                pad = np.zeros((q_emb.shape[0], index_dim - q_emb.shape[1]), dtype=q_emb.dtype)
                                q_emb = np.concatenate([q_emb, pad], axis=1)
                            _debug("➡️ Adapted query shape {}", q_emb.shape)

                        # 🧭 Search the FAISS index with broader K, then filter by assignment and dedupe
                        # Increase K dynamically to improve recall when the global index is large
                        try:
                            total_meta = len(vi.meta or [])
                        except Exception:
                            total_meta = 100
                        # Estimate per-assignment count (cached)
                        assign_cnt = 0
                        if assignment_id:
                            key_cnt = ("assign_count", assignment_id)
                            assign_cnt = _small_cache.get(key_cnt) or 0
                            if assign_cnt == 0:
                                try:
                                    assign_cnt = sum(1 for m in (vi.meta or []) if (m or {}).get("assignment_id") == assignment_id)
                                except Exception:
                                    assign_cnt = 0
                        search_k = max(top_k * 50, 200, assign_cnt * 50)
                        search_k = min(search_k, total_meta)
                        D, I = vi.index.search(q_emb, search_k)
                        _debug("FAISS search results: D={}, I={}", D.tolist(), I.tolist())

                        # Filter results to same assignment; exclude self; dedupe by best score
                        best_by_sid: dict[str, float] = {}
                        filtered = 0
                        for dist, idx in zip(D[0], I[0]):
                            if idx >= len(vi.meta):
                                continue
                            meta = vi.meta[idx] or {}
                            sid = meta.get("submission_id", f"id_{idx}")
                            if sid == submission_id:
                                # exclude self-match
                                continue
                            cand_assign = meta.get("assignment_id")
                            if assignment_id:
                                if not cand_assign:
                                    cand_assign = get_assignment_for_submission(sid)
                                if cand_assign != assignment_id:
                                    filtered += 1
                                    continue
                            # Robust similarity from L2 distance
                            try:
                                sim = 1.0 / (1.0 + float(dist))
                            except Exception:
                                sim = 0.0
                            if sid not in best_by_sid or sim > best_by_sid[sid]:
                                best_by_sid[sid] = sim
                        # Keep top by score after filtering
                        candidates = sorted(({"submission_id": s, "score": sc} for s, sc in best_by_sid.items()), key=lambda x: x["score"], reverse=True)[:top_k]
                        _debug("FAISS candidates after filtering (same assignment, no self): {} ({} filtered out)", len(candidates), filtered)

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
            _debug("No FAISS results; considering fallback (BM25/S3).")
            # To enforce assignment-only comparisons, we disable BM25/S3 fallback unless we have a per-assignment corpus.
            # This avoids cross-assignment false positives when it's the first submission.
            try:
                if get_or_build_bm25 and assignment_id:
                    bm25_obj, meta = get_or_build_bm25(assignment_id, {})
                    if bm25_obj and meta and meta.get("tokenized_docs"):
                        _debug("BM25 fallback available with per-assignment corpus (not implemented scoring here).")
                    else:
                        _debug("BM25 fallback skipped: no per-assignment corpus.")
            except Exception as e:
                _debug("BM25 fallback error: {}", e)

        # We disable S3 fallback when assignment_id is provided to avoid cross-assignment noise.
        # If you later encode assignment_id into S3 keys or metadata, we can re-enable with strict filtering.

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
        # 🧱 Step 5: Incremental index update (so the NEXT submission can match this one)
        # ----------------------------
        try:
            if get_vector_index is not None and assignment_id:
                vi_upd = get_vector_index()
                # Only add if this submission_id is not already indexed
                already = any((m.get("submission_id") == submission_id) for m in (vi_upd.meta or []))
                if not already:
                    # simple chunking by words
                    def _chunk_text(t: str, size_w: int, overlap_w: int):
                        # cache chunking by text hash to avoid recompute
                        key = ("chunks", hash(t), size_w, overlap_w)
                        cached = _small_cache.get(key)
                        if cached is not None:
                            return cached
                        words = (t or "").split()
                        chunks = []
                        i = 0
                        n = len(words)
                        while i < n:
                            chunk = " ".join(words[i:i+size_w])
                            if chunk.strip():
                                chunks.append(chunk)
                            if i + size_w >= n:
                                break
                            i += max(1, size_w - overlap_w)
                        _small_cache.set(key, chunks)
                        return chunks

                    size_w = int(os.getenv("CHUNK_SIZE_WORDS", "250") or 250)
                    overlap_w = int(os.getenv("CHUNK_OVERLAP_WORDS", "50") or 50)
                    chunks = _chunk_text(text, size_w, overlap_w)

                    # Encode with the model matched to index dim
                    import numpy as np
                    vecs = vi_upd.encode(chunks)
                    if vecs.ndim == 1:
                        vecs = np.expand_dims(vecs, axis=0)
                    vecs = vecs.astype("float32")
                    # normalize
                    try:
                        if faiss is not None:
                            faiss.normalize_L2(vecs)
                        else:
                            vecs /= (np.linalg.norm(vecs, axis=1, keepdims=True) + 1e-12)
                    except Exception:
                        pass
                    # adapt dims if needed
                    try:
                        index_dim = getattr(vi_upd.index, 'd', None)
                    except Exception:
                        index_dim = None
                    if index_dim is not None and vecs.shape[1] != index_dim:
                        if vecs.shape[1] > index_dim:
                            vecs = vecs[:, :index_dim]
                        else:
                            pad = np.zeros((vecs.shape[0], index_dim - vecs.shape[1]), dtype=vecs.dtype)
                            vecs = np.concatenate([vecs, pad], axis=1)

                    # add to index + meta
                    start_len = len(vi_upd.meta or [])
                    vi_upd.index.add(vecs)
                    if vi_upd.meta is None:
                        vi_upd.meta = []
                    for _ in range(len(chunks)):
                        vi_upd.meta.append({"submission_id": submission_id, "assignment_id": assignment_id})
                    # Update the per-assignment count cache now that we've added entries
                    try:
                        key = ("assign_count", assignment_id)
                        new_cnt = sum(1 for m in (vi_upd.meta or []) if (m or {}).get("assignment_id") == assignment_id)
                        if new_cnt > 0:
                            _small_cache.set(key, new_cnt)
                    except Exception:
                        pass
                    vi_upd.save()
                    _debug("Incremental FAISS add: +{} vectors for submission {} (meta size {} -> {})",
                           len(chunks), submission_id, start_len, len(vi_upd.meta))

                    # Also persist chunks to DB so future full re-ingest includes them
                    try:
                        import psycopg2
                        db_url = os.getenv("DATABASE_URL")
                        if db_url:
                            conn = psycopg2.connect(dsn=db_url)
                            cur = conn.cursor()
                            # Only insert if no rows for this submission
                            cur.execute('SELECT 1 FROM "SubmissionChunk" WHERE "submissionId" = %s LIMIT 1', (submission_id,))
                            exists = cur.fetchone()
                            if not exists:
                                for idx, c in enumerate(chunks):
                                    gen_id = str(uuid.uuid4())
                                    cur.execute('INSERT INTO "SubmissionChunk" (id, content, "submissionId", chunk_index) VALUES (%s, %s, %s, %s)', (gen_id, c, submission_id, idx))
                                conn.commit()
                            cur.close()
                            conn.close()
                    except Exception as dbe:
                        _debug("DB chunk insert failed: {}", dbe)
        except Exception as upde:
            _debug("Incremental indexing failed: {}", upde)

        # ----------------------------
        # ✅ Step 6: Final result
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
        f = _get_fitz()
        if not b or not f:
            return b""
        doc = f.open(stream=b, filetype="pdf")
        text_all = "\n".join(p.get_text("text") for p in doc)

        # Colors
        YELLOW = (1.0, 1.0, 0.0)          # copied
        ORANGE = (1.0, 0.647, 0.0)        # AI-generated
        LIGHT_RED = (1.0, 0.6, 0.6)       # both copied + AI

        # Helper: add colored highlight for phrase occurrences across pages
        def highlight_phrases(phrases, color):
            if not phrases:
                return 0
            count = 0
            # Limit to avoid excessive annotations
            max_annots = 200
            for page in doc:
                for ph in phrases:
                    try:
                        # Try multiple case variants to improve hit rate
                        variants = [ph, ph.title(), ph.upper()]
                        rects = []
                        for v in variants:
                            rects = page.search_for(v, quads=False)
                            if rects:
                                break
                    except Exception:
                        rects = []
                    for r in rects:
                        ann = page.add_highlight_annot(r)
                        try:
                            ann.set_colors(stroke=color)
                            ann.update()
                        except Exception:
                            pass
                        count += 1
                        if count >= max_annots:
                            return count
            return count

        # Helper: sentence split
        def split_sentences(t: str):
            import re
            # naive split on .!? while keeping reasonable length
            sents = re.split(r"(?<=[\.!?])\s+", t)
            return [s.strip() for s in sents if len(s.strip()) > 0]

        # Helper: overlapping n-grams
        def overlapping_ngrams(a: str, b: str, n: int = 5, limit: int = 30):
            import re
            ta = re.findall(r"\w+", (a or "").lower())
            tb = re.findall(r"\w+", (b or "").lower())
            def ngrams(toks):
                return [" ".join(toks[i:i+n]) for i in range(0, max(0, len(toks)-n+1))]
            ng_a = set(ngrams(ta))
            ng_b = set(ngrams(tb))
            inter = [x for x in ng_a & ng_b if len(x) > 10]
            # prefer longer/rarer phrases first
            inter.sort(key=lambda x: (-len(x), x))
            return inter[:limit]

        # Optional: DB lookup to get fileUrl by submission id
        def get_submission_file_url(sub_id: str) -> str | None:
            if not sub_id:
                return None
            try:
                import psycopg2
                db_url = os.getenv("DATABASE_URL")
                if not db_url:
                    return None
                conn = psycopg2.connect(dsn=db_url)
                cur = conn.cursor()
                cur.execute('SELECT "fileUrl" FROM "Submission" WHERE id = %s LIMIT 1', (sub_id,))
                row = cur.fetchone()
                cur.close()
                conn.close()
                return row[0] if row and row[0] else None
            except Exception:
                return None

        total_ai = 0
        total_copy = 0
        total_both = 0
        phrases = []

        # 1) Copied plagiarism highlights (YELLOW): compare with best in-assignment match and mark overlapping 5-grams
        if assignment_id and submission_id and get_vector_index is not None:
            try:
                vi = get_vector_index()
                import numpy as np
                q = vi.encode([text_all]).astype("float32")
                try:
                    if faiss is not None:
                        faiss.normalize_L2(q)
                    else:
                        q /= (np.linalg.norm(q, axis=1, keepdims=True) + 1e-12)
                except Exception:
                    pass
                # adapt dims
                index_dim = getattr(vi.index, 'd', None)
                if index_dim is not None and q.shape[1] != index_dim:
                    if q.shape[1] > index_dim:
                        q = q[:, :index_dim]
                    else:
                        pad = np.zeros((q.shape[0], index_dim - q.shape[1]), dtype=q.dtype)
                        q = np.concatenate([q, pad], axis=1)
                # broader search then filter — use dynamic K to improve recall
                try:
                    total_meta = len(vi.meta or [])
                except Exception:
                    total_meta = 100
                assign_cnt = 0
                if assignment_id:
                    key_cnt = ("assign_count", assignment_id)
                    assign_cnt = _small_cache.get(key_cnt) or 0
                    if assign_cnt == 0:
                        try:
                            assign_cnt = sum(1 for m in (vi.meta or []) if (m or {}).get("assignment_id") == assignment_id)
                        except Exception:
                            assign_cnt = 0
                search_k = max(200, assign_cnt * 50)
                search_k = min(search_k, total_meta)
                D, I = vi.index.search(q, search_k)
                best_sid = None
                for dist, idx in zip(D[0], I[0]):
                    if idx >= len(vi.meta):
                        continue
                    meta = vi.meta[idx] or {}
                    sid = meta.get("submission_id")
                    if not sid or sid == submission_id:
                        continue
                    cand_assign = meta.get("assignment_id")
                    if not cand_assign:
                        cand_assign = get_assignment_for_submission(sid)
                    if cand_assign == assignment_id:
                        best_sid = sid
                        break
                if best_sid:
                    other_url = get_submission_file_url(best_sid)
                    if other_url:
                        other_b = fetch_via_http(other_url) or fetch_via_s3(other_url)
                        if other_b:
                            other_doc = f.open(stream=other_b, filetype="pdf")
                            other_text = "\n".join(p.get_text("text") for p in other_doc)
                            copy_phrases = overlapping_ngrams(text_all, other_text, n=5, limit=40)
                            # We'll compute AI phrases below, then intersect.
                            phrases = copy_phrases
                            _debug("Found {} overlapping phrases vs submission {}", len(copy_phrases), best_sid)
            except Exception as ce:
                _debug("Copied-highlight step failed: {}", ce)

        # 2) AI-generated highlights (ORANGE): high-probability sentences
        try:
            AI_THRESH = float(os.getenv("AI_SENTENCE_THRESHOLD", os.getenv("AI_THRESHOLD", "0.7")))
            sents = split_sentences(text_all)
            # limit to avoid heavy inference
            max_sents = min(len(sents), 200)
            ai_phrases = []
            for s in sents[:max_sents]:
                try:
                    p = float(detect_ai_probability(s))
                except Exception:
                    p = 0.0
                if p >= AI_THRESH and len(s) > 20:
                    ai_phrases.append(s[:200])  # truncate to keep search efficient
            # If we also have copy phrases, compute intersection: copied phrase contained within an AI sentence
            combined_phrases = []
            if phrases:
                pl = [p.lower() for p in phrases]
                for s in ai_phrases:
                    sl = s.lower()
                    for p in pl:
                        if p in sl:
                            combined_phrases.append(p)
                # unique
                combined_phrases = list(dict.fromkeys(combined_phrases))

            # Highlight combined (both) first in light red
            if combined_phrases:
                total_both = highlight_phrases(combined_phrases, LIGHT_RED)
                _debug("Highlighted {} combined (light red)", total_both)

            # Then highlight remaining copied-only (yellow)
            if phrases:
                copy_only = []
                if combined_phrases:
                    cset = set(combined_phrases)
                    for p in phrases:
                        if p.lower() not in cset:
                            copy_only.append(p)
                else:
                    copy_only = phrases
                if copy_only:
                    total_copy = highlight_phrases(copy_only, YELLOW)
                    _debug("Highlighted {} copied-only (yellow)", total_copy)

            # Finally, highlight AI-only sentences (orange)
            if ai_phrases:
                if combined_phrases:
                    cset = set(combined_phrases)
                    ai_only = []
                    for s in ai_phrases:
                        if not any(p in s.lower() for p in cset):
                            ai_only.append(s)
                else:
                    ai_only = ai_phrases
                if ai_only:
                    total_ai = highlight_phrases(ai_only, ORANGE)
                    _debug("Highlighted {} AI-only (orange)", total_ai)
        except Exception as ae:
            _debug("AI-highlight step failed: {}", ae)

        # If there are no reasons to highlight (no candidates and no AI), return original to avoid misleading marks
        out = io.BytesIO()
        doc.save(out)
        _debug("Generated highlighted PDF bytes len={} (ai={}, copy={}, both={})", out.getbuffer().nbytes, total_ai, total_copy, total_both)
        return out.getvalue()
    except Exception as e:
        _debug("generate_highlighted_pdf exception: {}", e)
        return b""


def process_submission_task(submission_id, assignment_id, file_url=None):
    """Direct-call wrapper maintained for compatibility; no background queue."""
    res = run_check(submission_id, assignment_id, None, file_url)
    pdf = generate_highlighted_pdf(file_url, submission_id, assignment_id)
    return {"submission_id": submission_id, "result": res, "highlighted_pdf": bool(pdf)}
