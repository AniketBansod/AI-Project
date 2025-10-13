import os
import numpy as np
from vector_index import VectorIndex
from sentence_transformers import SentenceTransformer
from psycopg2 import pool, OperationalError
from pgvector.psycopg2 import register_vector
from dotenv import load_dotenv

# Load .env file
load_dotenv()

# Get DATABASE_URL from .env
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("❌ DATABASE_URL is not set in your .env file!")

# Use the same embedding model everywhere (query + index)
# Standardize: single light model with 384-dim
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")

try:
    # Create connection pool
    db_pool = pool.SimpleConnectionPool(1, 10, dsn=DATABASE_URL)
    conn = db_pool.getconn()
    register_vector(conn)
    print("✅ Connected to PostgreSQL (Supabase)")

    cur = conn.cursor()
    # Include assignment_id via join so we can filter within the same assignment at query time
    cur.execute('''
        SELECT c.id, c."submissionId", s."assignmentId", c.content
        FROM "SubmissionChunk" c
        JOIN "Submission" s ON s.id = c."submissionId"
    ''')
    rows = cur.fetchall()

    print(f"📦 Retrieved {len(rows)} chunks from DB")

    # Load sentence transformer model
    model = SentenceTransformer(EMBEDDING_MODEL)

    # Encode content into vectors
    texts = [r[3] for r in rows]
    vectors = model.encode(texts, convert_to_numpy=True, show_progress_bar=True)
    vectors = vectors.astype(np.float32, copy=False)
    # Normalize to unit length to align with L2-based cosine approximation
    try:
        import faiss as _faiss  # type: ignore
        _faiss.normalize_L2(vectors)
    except Exception:
        norms = np.linalg.norm(vectors, axis=1, keepdims=True) + 1e-12
        vectors = vectors / norms
    metadata = [{"chunk_id": r[0], "submission_id": r[1], "assignment_id": r[2]} for r in rows]

    # Build and save vector index
    index = VectorIndex()
    index.build_index(vectors, metadata)
    index.save()

    print("✅ Vector index built and saved successfully!")

    # Close connection
    cur.close()
    conn.close()
    db_pool.putconn(conn)

except OperationalError as e:
    print("❌ Database connection failed:", e)
