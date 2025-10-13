# fusion.py
"""
BM25 + learned fusion helper.
Loads fusion_model.pkl which may contain {'model':..., 'scaler':...}.
If model/scaler present, it will scale incoming features before prediction.
Fallback: heuristic weights.
"""

import os
import math
import pickle
from typing import List

from rank_bm25 import BM25Okapi
import numpy as np
import re

FUSION_MODEL_PATH = os.getenv("FUSION_MODEL_PATH", "fusion_model.pkl")

# heuristic weights fallback (tunable)
HEURISTIC_WEIGHTS = {
    "faiss": 0.5,
    "bm25": 0.25,
    "cross": 0.15,
    "lex": 0.05,
    "ai_penalty": -0.2,
}

def safe_norm(x):
    try:
        return float(x)
    except Exception:
        return 0.0

class BM25Index:
    def __init__(self, docs_tokens: List[List[str]]):
        self.bm25 = BM25Okapi(docs_tokens)
    def score(self, query_tokens: List[str]):
        return self.bm25.get_scores(query_tokens)

def tokenize_simple(text: str):
    toks = re.findall(r"\w+", (text or "").lower())
    return toks

def jaccard_char_trigrams(a: str, b: str) -> float:
    a = (a or "").lower()
    b = (b or "").lower()
    def trigrams(s):
        s2 = s.replace(" ", "")
        if len(s2) < 3:
            return set([s2]) if s2 else set()
        return set(s2[i:i+3] for i in range(len(s2)-2))
    A = trigrams(a)
    B = trigrams(b)
    if not A or not B:
        return 0.0
    inter = len(A & B)
    return inter / len(A | B)

# Load fusion model if available. The file may be:
# - plain sklearn model (old style) OR
# - dict {"model": sklearn_model, "scaler": MinMaxScaler}
_fusion_obj = None
_fusion_model = None
_fusion_scaler = None
if os.path.exists(FUSION_MODEL_PATH):
    try:
        with open(FUSION_MODEL_PATH, "rb") as f:
            _fusion_obj = pickle.load(f)
        # detect structure
        if isinstance(_fusion_obj, dict) and "model" in _fusion_obj:
            _fusion_model = _fusion_obj.get("model")
            _fusion_scaler = _fusion_obj.get("scaler")
            print("Loaded fusion model + scaler from", FUSION_MODEL_PATH)
        else:
            _fusion_model = _fusion_obj
            _fusion_scaler = None
            print("Loaded fusion model (no scaler) from", FUSION_MODEL_PATH)
    except Exception as e:
        print("Failed to load fusion model:", e)
        _fusion_obj = None
        _fusion_model = None
        _fusion_scaler = None

def build_features(faiss_score: float,
                   bm25_score: float,
                   cross_score: float,
                   lexical_jaccard: float,
                   ai_prob: float) -> List[float]:
    return [safe_norm(faiss_score), safe_norm(bm25_score), safe_norm(cross_score),
            safe_norm(lexical_jaccard), safe_norm(ai_prob)]

def predict_fused_score(features: List[float]) -> float:
    # if we have model+scaler, use it
    if _fusion_model is not None:
        try:
            import numpy as _np
            x = _np.array(features).reshape(1, -1)
            if _fusion_scaler is not None:
                x = _fusion_scaler.transform(x)
            if hasattr(_fusion_model, "predict_proba"):
                prob = _fusion_model.predict_proba(x)[0][1]
            else:
                # fallback to decision_function or predict
                try:
                    prob = float(_fusion_model.decision_function(x).ravel()[0])
                    # logistic regression decision_function might be raw logit; convert using logistic
                    prob = 1.0 / (1.0 + math.exp(-prob))
                except Exception:
                    prob = float(_fusion_model.predict(x)[0])
            return float(max(0.0, min(1.0, prob)))
        except Exception as e:
            print("Fusion model predict failed, falling back to heuristic:", e)

    # heuristic fallback
    f = {"faiss": features[0], "bm25": features[1], "cross": features[2], "lex": features[3], "ai": features[4]}
    w = HEURISTIC_WEIGHTS
    score = (w["faiss"] * f["faiss"] + w["bm25"] * f["bm25"] + w["cross"] * f["cross"] + w["lex"] * f["lex"])
    score = score + w["ai_penalty"] * f["ai"]
    return float(max(0.0, min(1.0, score)))

def save_model(sklearn_model, scaler=None, path: str = FUSION_MODEL_PATH):
    # Save as dict with model+scaler if scaler provided, else save model directly
    if scaler is not None:
        obj = {"model": sklearn_model, "scaler": scaler}
    else:
        obj = sklearn_model
    with open(path, "wb") as f:
        pickle.dump(obj, f)
    print("Saved fusion model to", path)
