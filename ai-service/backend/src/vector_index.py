# backend/src/vector_index.py

import os
import pickle
import faiss
from sentence_transformers import SentenceTransformer
import numpy as np
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class VectorIndex:
    def __init__(self, index_path=None, meta_path=None, model_name=None):
        # Use env vars if not explicitly passed
        self.index_path = index_path or os.getenv("FAISS_INDEX_PATH", "backend/src/faiss_index.bin")
        self.meta_path = meta_path or os.getenv("FAISS_META_PATH", "backend/src/faiss_meta.pkl")
        self.model_name = model_name or os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")

        self.index = None
        self.meta = None
        self.model = None

    # ---------- 🧠 Embedding + Build ----------
    def encode(self, texts):
        """Convert text chunks into embeddings."""
        if self.model is None:
            self.model = SentenceTransformer(self.model_name)
        return np.array(self.model.encode(texts, convert_to_numpy=True, show_progress_bar=False), dtype=np.float32)

    def build_index(self, vectors, metadata):
        """Build FAISS index from vectors + metadata."""
        if not isinstance(vectors, np.ndarray):
            vectors = np.array(vectors, dtype=np.float32)

        dim = vectors.shape[1]
        self.index = faiss.IndexFlatL2(dim)
        self.index.add(vectors)
        self.meta = metadata
        print(f"✅ Built FAISS index with {len(metadata)} vectors (dim={dim})")
        self.save()

    def save(self):
        """Save index + metadata to disk."""
        faiss.write_index(self.index, self.index_path)
        with open(self.meta_path, "wb") as f:
            pickle.dump(self.meta, f)
        print(f"💾 Saved FAISS index → {self.index_path}")
        print(f"💾 Saved metadata → {self.meta_path}")

    # ---------- 📦 Load + Search ----------
    def load(self):
        """Load FAISS index, metadata, and embedding model."""
        if os.path.exists(self.index_path) and os.path.exists(self.meta_path):
            print(f"✅ FAISS index loaded from {self.index_path}")
            self.index = faiss.read_index(self.index_path)
            with open(self.meta_path, "rb") as f:
                self.meta = pickle.load(f)
            print(f"✅ Loaded FAISS meta ({len(self.meta)} entries)")
            print(f"🔍 Loading embedding model: {self.model_name}")
            self.model = SentenceTransformer(self.model_name)
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
                        "similarity": float(1 - dist)
                    })
            results.append(row)
        return results


# ---------- 🌍 Singleton Loader ----------
_vector_index_instance = None

def get_vector_index():
    """Load a single global FAISS index instance (used by plagiarism_tasks)."""
    global _vector_index_instance
    if _vector_index_instance is None:
        vi = VectorIndex()
        vi.load()
        _vector_index_instance = vi
    return _vector_index_instance
