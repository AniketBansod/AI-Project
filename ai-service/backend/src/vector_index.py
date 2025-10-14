# backend/src/vector_index.py

import os
import pickle
try:
    import faiss  # type: ignore
except Exception:
    faiss = None  # Will error at build/search if missing
import numpy as np
from dotenv import load_dotenv
import time
from collections import OrderedDict

# Load environment variables
load_dotenv()

class VectorIndex:
    def __init__(self, index_path=None, meta_path=None, model_name=None):
        # Use env vars if not explicitly passed; default to /app/data so docker volume can persist data without hiding code
        self.index_path = index_path or os.getenv("FAISS_INDEX_PATH", "/app/data/faiss_index.bin")
        self.meta_path = meta_path or os.getenv("FAISS_META_PATH", "/app/data/faiss_meta.pkl")
        self.model_name = model_name or os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")

        self.index = None
        self.meta = None
        self.model = None

    # ---------- 🧠 Embedding + Build ----------
    def encode(self, texts):
        """Convert text chunks into embeddings."""
        # Normalize input to list
        single = False
        if isinstance(texts, str):
            texts = [texts]
            single = True

        # Tiny in-process TTL LRU cache for embeddings
        vecs = self._encode_with_cache(texts)
        return vecs[0] if single else vecs

    # --- internal helpers ---
    _embed_cache = None  # type: ignore

    @staticmethod
    def _get_embed_cache(max_size: int = 256, ttl_sec: int = 900):
        # Simple TTL LRU cache: OrderedDict of key -> (expire_ts, np.array)
        if VectorIndex._embed_cache is None:
            class _TTLCache:
                def __init__(self, max_size, ttl_sec):
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
                    # refresh LRU
                    self.store.move_to_end(key)
                    return val

                def set(self, key, val):
                    now = time.time()
                    self.store[key] = (now + self.ttl_sec, val)
                    self.store.move_to_end(key)
                    # evict
                    while len(self.store) > self.max_size:
                        try:
                            self.store.popitem(last=False)
                        except Exception:
                            break

            VectorIndex._embed_cache = _TTLCache(max_size, ttl_sec)
        return VectorIndex._embed_cache

    def _encode_with_cache(self, texts: list[str]) -> np.ndarray:
        if self.model is None:
            # Lazy import and initialize only when first used
            from sentence_transformers import SentenceTransformer  # local import to avoid heavy import at module load
            self.model = SentenceTransformer(self.model_name)
        cache = self._get_embed_cache()
        # Check cache per text
        misses_idx = []
        cached_rows = {}
        for i, t in enumerate(texts):
            key = f"{self.model_name}:{t}"
            v = cache.get(key)
            if v is None:
                misses_idx.append(i)
            else:
                cached_rows[i] = v

        # Encode misses in batch
        enc = None
        if misses_idx:
            miss_texts = [texts[i] for i in misses_idx]
            enc = self.model.encode(miss_texts, convert_to_numpy=True, show_progress_bar=False)
            if enc.ndim == 1:
                enc = np.expand_dims(enc, axis=0)
            enc = enc.astype(np.float32, copy=False)
            # store
            for j, i in enumerate(misses_idx):
                key = f"{self.model_name}:{texts[i]}"
                cache.set(key, enc[j])

        # Assemble in original order
        out = []
        miss_ptr = 0
        for i in range(len(texts)):
            if i in cached_rows:
                out.append(cached_rows[i])
            else:
                out.append(enc[miss_ptr])
                miss_ptr += 1
        return np.array(out, dtype=np.float32)

    def build_index(self, vectors, metadata):
        """Build FAISS index from vectors + metadata."""
        if faiss is None:
            raise ImportError("faiss-cpu is required to build the vector index. Please install it.")
        if not isinstance(vectors, np.ndarray):
            vectors = np.array(vectors, dtype=np.float32)
        else:
            vectors = vectors.astype(np.float32, copy=False)

        # L2-normalize embeddings so L2 distance approximates cosine distance
        try:
            import faiss as _faiss
            _faiss.normalize_L2(vectors)
        except Exception:
            norms = np.linalg.norm(vectors, axis=1, keepdims=True) + 1e-12
            vectors = vectors / norms

        dim = vectors.shape[1]
        self.index = faiss.IndexFlatL2(dim)
        self.index.add(vectors)
        self.meta = metadata
        print(f"✅ Built FAISS index with {len(metadata)} vectors (dim={dim})")
        self.save()

    def save(self):
        """Save index + metadata to disk."""
        # Ensure target directory exists
        try:
            os.makedirs(os.path.dirname(self.index_path), exist_ok=True)
            os.makedirs(os.path.dirname(self.meta_path), exist_ok=True)
        except Exception:
            pass
        faiss.write_index(self.index, self.index_path)
        with open(self.meta_path, "wb") as f:
            pickle.dump(self.meta, f)
        print(f"💾 Saved FAISS index → {self.index_path}")
        print(f"💾 Saved metadata → {self.meta_path}")

    # ---------- 📦 Load + Search ----------
    def load(self):
        """Load FAISS index and metadata only (no model). Model is loaded lazily on first encode()."""
        if os.path.exists(self.index_path) and os.path.exists(self.meta_path):
            print(f"✅ FAISS index loaded from {self.index_path}")
            if faiss is None:
                raise ImportError("faiss-cpu is required to load the vector index. Please install it.")
            self.index = faiss.read_index(self.index_path)
            with open(self.meta_path, "rb") as f:
                self.meta = pickle.load(f)
            dim = getattr(self.index, 'd', None)
            print(f"✅ Loaded FAISS meta ({len(self.meta)} entries)")
            if dim is not None:
                print(f"🔢 FAISS index dimension: {dim}")
        else:
            raise FileNotFoundError(f"❌ Missing FAISS index or meta at {self.index_path} / {self.meta_path}")

    def search(self, query_vectors, top_k=5):
        """Search top_k similar vectors."""
        if self.index is None or self.meta is None:
            raise ValueError("Index not loaded. Call .load() first.")

        if not isinstance(query_vectors, np.ndarray):
            raise TypeError("Expected numpy.ndarray for query_vectors.")

        D, I = self.index.search(query_vectors, top_k)
        results = []
        for idx_list, dist_list in zip(I, D):
            row = []
            for idx, dist in zip(idx_list, dist_list):
                if idx < len(self.meta):
                    row.append({
                        "submission_id": self.meta[idx].get("submission_id", f"id_{idx}"),
                        "assignment_id": self.meta[idx].get("assignment_id"),
                        # With L2-normalized vectors, use a stable mapping from L2 distance to similarity
                        "similarity": float(1.0 / (1.0 + float(dist)))
                    })
            results.append(row)
        return results


# ---------- 🌍 Singleton Loader ----------
_vector_index_instance = None

def get_vector_index():
    """Load a single global FAISS index instance (used by plagiarism_tasks).
    If no index is present on disk yet, initialize an empty one with the correct
    embedding dimension so incremental indexing can proceed on first submission.
    """
    global _vector_index_instance
    if _vector_index_instance is None:
        vi = VectorIndex()
        try:
            vi.load()
        except FileNotFoundError:
            # No saved index yet — create an empty one with the model's embedding dimension
            if faiss is None:
                raise ImportError("faiss-cpu is required to initialize the vector index.")
            # Lazily instantiate model and infer dimension
            from sentence_transformers import SentenceTransformer
            model = SentenceTransformer(vi.model_name)
            dummy = model.encode(["init"], convert_to_numpy=True, show_progress_bar=False)
            if dummy.ndim == 1:
                import numpy as _np
                dummy = _np.expand_dims(dummy, axis=0)
            dim = int(dummy.shape[1])
            vi.model = model
            vi.index = faiss.IndexFlatL2(dim)
            vi.meta = []
            # Persist empty index and meta so subsequent loads succeed
            vi.save()
            print(f"🆕 Initialized empty FAISS index (dim={dim}) at {vi.index_path}")
        _vector_index_instance = vi
    return _vector_index_instance
