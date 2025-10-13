# ai_detector.py
"""
AI Text Detection Module (production-ready)
- Loads detector models listed in DETECTOR_MODELS (comma-separated).
- Optional perplexity scoring via a causal LM (PERPLEXITY_MODEL).
- Uses Redis for caching when REDIS_URL is present (supports rediss://).
- Falls back to a lightweight heuristic if heavy ML deps are unavailable.
- Supports chunking / scoring long texts via CHUNK_SIZE_WORDS and CHUNK_OVERLAP_WORDS.
"""

import os
import math
import json
from typing import Optional, List

from dotenv import load_dotenv
load_dotenv()

# Config from env
DETECTOR_MODELS = os.getenv(
    "DETECTOR_MODELS",
    "Hello-SimpleAI/chatgpt-detector-roberta,roberta-base-openai-detector"
).split(",")
DETECTOR_MODELS = [m.strip() for m in DETECTOR_MODELS if m.strip()]

ENABLE_PERPLEXITY = os.getenv("ENABLE_PERPLEXITY", "false").lower() == "true"
PERPLEXITY_MODEL = os.getenv("PERPLEXITY_MODEL", "gpt2")
PERPLEXITY_WEIGHT = float(os.getenv("PERPLEXITY_WEIGHT", 0.5))

REDIS_URL = os.getenv("REDIS_URL")
CHUNK_SIZE_WORDS = int(os.getenv("CHUNK_SIZE_WORDS", "250"))
CHUNK_OVERLAP_WORDS = int(os.getenv("CHUNK_OVERLAP_WORDS", "50"))
AI_THRESHOLD = float(os.getenv("AI_THRESHOLD", "0.5"))

# Optional heavy deps (lazy)
torch = None
AutoTokenizer = None
AutoModelForSequenceClassification = None
AutoModelForCausalLM = None

_transformers_ready = None  # tri-state: None (unknown), True/False (checked)

def _ensure_transformers() -> bool:
    """Import torch and transformers lazily; return True if available."""
    global torch, AutoTokenizer, AutoModelForSequenceClassification, AutoModelForCausalLM, _transformers_ready
    if _transformers_ready is True:
        return True
    if _transformers_ready is False:
        return False
    try:
        import torch as _torch
        from transformers import (
            AutoTokenizer as _AutoTokenizer,
            AutoModelForSequenceClassification as _AutoModelForSequenceClassification,
            AutoModelForCausalLM as _AutoModelForCausalLM,
        )
        torch = _torch
        AutoTokenizer = _AutoTokenizer
        AutoModelForSequenceClassification = _AutoModelForSequenceClassification
        AutoModelForCausalLM = _AutoModelForCausalLM
        _transformers_ready = True
        return True
    except Exception:
        _transformers_ready = False
        return False

# Redis cache (supports rediss)
try:
    import redis as _redis
    if REDIS_URL:
        redis_client = _redis.from_url(REDIS_URL, decode_responses=True, ssl=REDIS_URL.startswith("rediss://"))
        try:
            redis_client.ping()
        except Exception:
            redis_client = None
    else:
        redis_client = None
except Exception:
    redis_client = None

_detectors = None  # type: Optional[list]
_device = None

def _get_detectors():
    """Load detector models once and cache them; return list of (name, tok, model, device) or []."""
    global _detectors, _device
    if _detectors is not None:
        return _detectors
    if not _ensure_transformers():
        _detectors = []
        return _detectors
    try:
        dev = "cuda" if torch.cuda.is_available() else "cpu"
        dets = []
        for model_name in DETECTOR_MODELS:
            try:
                tok = AutoTokenizer.from_pretrained(model_name)
                m = AutoModelForSequenceClassification.from_pretrained(model_name).to(dev)
                dets.append((model_name, tok, m, dev))
                print(f"✅ Loaded detector {model_name} on {dev}")
            except Exception as e:
                print(f"⚠️ Failed to load detector {model_name}: {e}")
        _detectors = dets
        _device = dev
        return _detectors
    except Exception as e:
        print(f"⚠️ Detector loading failed: {e}")
        _detectors = []
        return _detectors

_ppl_tok = None
_ppl_model = None

def _get_ppl():
    """Load perplexity model/tokenizer lazily if enabled; return (tok, model) or (None, None)."""
    global _ppl_tok, _ppl_model
    if not ENABLE_PERPLEXITY:
        return None, None
    if _ppl_tok is not None and _ppl_model is not None:
        return _ppl_tok, _ppl_model
    if not _ensure_transformers():
        return None, None
    try:
        dev = "cuda" if torch.cuda.is_available() else "cpu"
        _ppl_tok = AutoTokenizer.from_pretrained(PERPLEXITY_MODEL)
        _ppl_model = AutoModelForCausalLM.from_pretrained(PERPLEXITY_MODEL).to(dev)
        print(f"✅ Loaded perplexity model {PERPLEXITY_MODEL} on {dev}")
        return _ppl_tok, _ppl_model
    except Exception as e:
        _ppl_tok = _ppl_model = None
        print("⚠️ Failed to load perplexity model:", e)
        return None, None


def chunk_text_words(text: str, chunk_size: int = CHUNK_SIZE_WORDS, overlap: int = CHUNK_OVERLAP_WORDS) -> List[str]:
    """
    Split text into overlapping word chunks.
    """
    words = text.split()
    if not words:
        return []
    chunks = []
    i = 0
    n = len(words)
    while i < n:
        chunk = words[i:i + chunk_size]
        chunks.append(" ".join(chunk))
        i += (chunk_size - overlap)
    return chunks


def compute_perplexity(text: str) -> float:
    tok, mdl = _get_ppl()
    if not tok or not mdl:
        return 0.0
    try:
        enc = tok(text, return_tensors="pt", truncation=True, max_length=1024).to(mdl.device)
        with torch.no_grad():
            loss = mdl(**enc, labels=enc["input_ids"]).loss
        ppl = float(torch.exp(loss).cpu().item())
        return ppl
    except Exception:
        return 0.0


def _score_with_detectors(text: str) -> List[float]:
    """
    Run each loaded detector on `text` and return a list of probabilities (0..1).
    If detectors are not available, returns an empty list.
    """
    scores = []
    dets = _get_detectors()
    if not dets:
        return scores

    for name, tok, mdl, device in dets:
        try:
            inputs = tok(text, truncation=True, max_length=512, return_tensors="pt").to(device)
            with torch.no_grad():
                logits = mdl(**inputs).logits
                probs = torch.softmax(logits, dim=-1)
                # best-effort: try index 1 for AI label, else fallback to 0
                ai_prob = float(probs[0, 1].cpu().item()) if probs.shape[-1] > 1 else float(probs[0, 0].cpu().item())
                scores.append(ai_prob)
        except Exception as e:
            print(f"⚠️ Detector {name} failed at scoring: {e}")
            continue
    return scores


def detect_ai_probability(text: str) -> float:
    """
    Returns a probability in [0,1] that `text` is AI-generated.
    Uses caching in Redis for repeated texts.
    Long texts are chunked and averaged.
    """
    text = (text or "").strip()
    if not text:
        return 0.0

    cache_key = f"ai_prob:{hash(text)}"
    if redis_client:
        try:
            cached = redis_client.get(cache_key)
            if cached is not None:
                return float(cached)
        except Exception:
            pass

    # If text is long, chunk it and average
    chunks = chunk_text_words(text)
    if not chunks:
        chunks = [text]

    chunk_scores = []
    for chunk in chunks:
        # detector models
        det_scores = _score_with_detectors(chunk)
        if det_scores:
            avg_det = sum(det_scores) / len(det_scores)
        else:
            avg_det = None

        # perplexity heuristic
        tok_m, mdl_m = _get_ppl()
        if ENABLE_PERPLEXITY and tok_m and mdl_m:
            ppl = compute_perplexity(chunk)
            ppl_score = 1 - (math.tanh(math.log(ppl + 1) / 10))  # convert perplexity -> approx [0,1]
        else:
            ppl_score = None

        # Combine detector and perplexity if both present
        if avg_det is not None and ppl_score is not None:
            combined = (avg_det * (1 - PERPLEXITY_WEIGHT)) + (ppl_score * PERPLEXITY_WEIGHT)
        elif avg_det is not None:
            combined = avg_det
        elif ppl_score is not None:
            combined = ppl_score
        else:
            # fallback heuristic: short sentences with low punctuation => slightly more likely AI
            avg_word_len = sum(len(w) for w in chunk.split()) / max(1, len(chunk.split()))
            punct_ratio = sum(1 for c in chunk if c in ".,!?;:") / max(1, len(chunk))
            heuristic = 0.5
            if avg_word_len < 4:
                heuristic += 0.1
            if punct_ratio < 0.02:
                heuristic += 0.1
            combined = min(1.0, heuristic)

        chunk_scores.append(max(0.0, min(1.0, float(combined))))

    final_score = float(sum(chunk_scores) / len(chunk_scores))

    if redis_client:
        try:
            redis_client.setex(cache_key, 7200, final_score)
        except Exception:
            pass

    return max(0.0, min(1.0, final_score))
