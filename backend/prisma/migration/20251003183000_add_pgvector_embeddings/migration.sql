-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Ensure SubmissionChunk has the correct embedding columns
ALTER TABLE "SubmissionChunk"
    ADD COLUMN IF NOT EXISTS embedding vector(384),
    ADD COLUMN IF NOT EXISTS embedding_mpnet vector(768);

-- Create index for ANN search on embedding_mpnet
CREATE INDEX IF NOT EXISTS submissionchunk_embedding_mpnet_ivfflat_idx
ON "SubmissionChunk"
USING ivfflat (embedding_mpnet vector_cosine_ops)
WITH (lists = 100);

-- Optional (Postgres 16+): HNSW index for better recall/latency
-- CREATE INDEX IF NOT EXISTS submissionchunk_embedding_mpnet_hnsw_idx
-- ON "SubmissionChunk"
-- USING hnsw (embedding_mpnet vector_cosine_ops);
