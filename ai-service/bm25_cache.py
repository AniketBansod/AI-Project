# bm25_cache.py
import json
import redis
import pickle
from typing import List, Dict
from rank_bm25 import BM25Okapi
from fusion import tokenize_simple

# Connect Redis once (reuse existing REDIS_URL)
import os
REDIS_URL = os.getenv("REDIS_URL")
if not REDIS_URL:
    raise ValueError("REDIS_URL not found in environment")

r = redis.from_url(REDIS_URL)

BM25_CACHE_TTL = 60 * 60 * 24  # 24h cache

def build_bm25_index(submissions: Dict[str, str]):
    """
    submissions: dict of {submission_id: text}
    returns BM25Okapi instance and tokenized_docs
    """
    tokenized_docs = [tokenize_simple(text) for text in submissions.values()]
    bm25 = BM25Okapi(tokenized_docs)
    return bm25, tokenized_docs

def cache_bm25_index(assignment_id: str, submissions: Dict[str, str]):
    bm25, tokenized_docs = build_bm25_index(submissions)
    meta = {
        "submission_ids": list(submissions.keys()),
        "tokenized_docs": tokenized_docs,
    }
    r.setex(f"bm25:{assignment_id}:meta", BM25_CACHE_TTL, json.dumps(meta))
    r.setex(f"bm25:{assignment_id}:model", BM25_CACHE_TTL, pickle.dumps(bm25))
    return bm25

def load_bm25_index(assignment_id: str):
    model_blob = r.get(f"bm25:{assignment_id}:model")
    meta_json = r.get(f"bm25:{assignment_id}:meta")
    if not model_blob or not meta_json:
        return None, None
    try:
        bm25 = pickle.loads(model_blob)
        meta = json.loads(meta_json)
        return bm25, meta
    except Exception:
        return None, None

def get_or_build_bm25(assignment_id: str, submissions: Dict[str, str]):
    bm25, meta = load_bm25_index(assignment_id)
    if bm25 and meta:
        return bm25, meta
    return cache_bm25_index(assignment_id, submissions)
