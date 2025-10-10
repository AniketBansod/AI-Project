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

try:
    # Create connection pool
    db_pool = pool.SimpleConnectionPool(1, 10, dsn=DATABASE_URL)
    conn = db_pool.getconn()
    register_vector(conn)
    print("✅ Connected to PostgreSQL (Supabase)")

    cur = conn.cursor()
    cur.execute('SELECT id, "submissionId", content FROM "SubmissionChunk"')
    rows = cur.fetchall()

    print(f"📦 Retrieved {len(rows)} chunks from DB")

    # Load sentence transformer model
    model = SentenceTransformer("sentence-transformers/all-mpnet-base-v2")

    # Encode content into vectors
    texts = [r[2] for r in rows]
    vectors = model.encode(texts, convert_to_numpy=True, show_progress_bar=True)
    metadata = [{"chunk_id": r[0], "submission_id": r[1]} for r in rows]

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
