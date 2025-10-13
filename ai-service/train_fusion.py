# train_fusion.py
"""
Train a fusion model (Logistic Regression) using public datasets or a custom CSV.

Usage examples:
  # STS-B (GLUE) dataset, sample 5000 pairs:
  python train_fusion.py --dataset stsb --sample 5000 --out fusion_model.pkl

  # PAWS (if available) + use cross-encoder
  python train_fusion.py --dataset paws --sample 8000 --use-cross --use-ai --out fusion_model.pkl

  # Custom CSV of pairs: csv must have columns: text_a,text_b,label  (label 0/1)
  python train_fusion.py --dataset custom --csv ./my_pairs.csv --sample 2000

Notes:
 - This script will save a pickle containing {'model': sklearn_model, 'scaler': MinMaxScaler}
   at the path provided by --out (default: fusion_model.pkl).
 - It tries to load your embedding & cross-encoder models from env (same names as main.py).
 - If cross-encoder or ai_detector are heavy, you can disable them with flags.
"""

import os
import sys
import argparse
import math
import time
import pickle
from typing import List, Tuple
from collections import defaultdict

import numpy as np
from tqdm import tqdm
from dotenv import load_dotenv
load_dotenv()

from datasets import load_dataset

# sentence-transformers / cross-encoder
from sentence_transformers import SentenceTransformer, CrossEncoder, util

# BM25
from rank_bm25 import BM25Okapi

# sklearn
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import MinMaxScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score

# AI detector (optional)
try:
    from ai_detector import detect_ai_probability
    AI_AVAILABLE = True
except Exception:
    AI_AVAILABLE = False

# helper text functions (copy from fusion.py)
import re
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

def build_bm25_score(a: str, b: str) -> float:
    # treat b as single document, query a
    docs = [tokenize_simple(b)]
    try:
        bm = BM25Okapi(docs)
        q = tokenize_simple(a)
        scores = bm.get_scores(q)
        return float(scores[0]) if len(scores) else 0.0
    except Exception:
        return 0.0

def load_text_pairs_from_dataset(name: str, sample: int = 1000):
    """
    Supported names:
      - stsb  -> GLUE stsb (sentence1, sentence2, label 0-5)
      - paws  -> PAWS dataset (if available)
      - custom -> CSV (handled separately)
    Returns list of (text_a, text_b, label)
    """
    pairs = []
    if name == "stsb":
        ds = load_dataset("glue", "stsb", split="train")
        # stsb label is 0-5 (float); treat >=3 as similar (1)
        for row in ds:
            a = row.get("sentence1") or row.get("text_a") or ""
            b = row.get("sentence2") or row.get("text_b") or ""
            lab = row.get("label", 0)
            lab = 1 if lab >= 3 else 0
            pairs.append((a, b, lab))
    elif name == "paws":
        # try multiple config names
        try:
            ds = load_dataset("paws", "labeled_final", split="train")
        except Exception:
            try:
                ds = load_dataset("paws", split="train")
            except Exception as e:
                print("PAWS dataset not found via datasets.load_dataset:", e)
                return []
        for row in ds:
            a = row.get("sentence1") or row.get("text_a") or ""
            b = row.get("sentence2") or row.get("text_b") or ""
            lab = int(row.get("label", 0))
            pairs.append((a, b, lab))
    else:
        raise ValueError("Dataset loader only supports 'stsb' and 'paws' via HF. Use --dataset custom to load CSV.")

    # sample
    if sample and sample > 0 and sample < len(pairs):
        import random
        pairs = random.sample(pairs, sample)
    return pairs

def load_pairs_from_csv(csv_path: str, sample: int = 0):
    import csv
    pairs = []
    with open(csv_path, newline='', encoding='utf-8') as fh:
        rdr = csv.DictReader(fh)
        # accept columns: text_a,text_b,label  or submission ids but here we expect raw text
        for r in rdr:
            a = r.get("text_a") or r.get("sentence1") or r.get("submission_a_text") or r.get("a") or ""
            b = r.get("text_b") or r.get("sentence2") or r.get("submission_b_text") or r.get("b") or ""
            lab = r.get("label") or r.get("y") or r.get("label_binary") or "0"
            try:
                lab = int(lab)
            except:
                lab = 1 if float(lab) > 0.5 else 0
            pairs.append((a, b, lab))
    if sample and sample > 0 and sample < len(pairs):
        import random
        pairs = random.sample(pairs, sample)
    return pairs

def compute_features_for_pairs(pairs: List[Tuple[str,str,int]],
                               embedding_model,
                               cross_encoder = None,
                               use_cross: bool = False,
                               use_ai: bool = False,
                               batch_size: int = 64):
    """
    Returns X matrix (N x 5) and y vector (N)
    features per row: [emb_sim, bm25_score, cross_score, lexical_jaccard, ai_prob]
    """
    N = len(pairs)
    X = np.zeros((N, 5), dtype=float)
    y = np.zeros((N,), dtype=int)
    # We'll encode embeddings in batches for speed
    # We'll compute BM25 and lexical per pair cheaply
    texts_a = [p[0] for p in pairs]
    texts_b = [p[1] for p in pairs]
    labels = [p[2] for p in pairs]

    # embeddings (batch)
    all_emb_a = []
    all_emb_b = []
    print("Encoding embeddings in batches...")
    for i in tqdm(range(0, N, batch_size)):
        batch_a = texts_a[i:i+batch_size]
        batch_b = texts_b[i:i+batch_size]
        try:
            emb_a = embedding_model.encode(batch_a, convert_to_numpy=True, show_progress_bar=False)
            emb_b = embedding_model.encode(batch_b, convert_to_numpy=True, show_progress_bar=False)
        except Exception as e:
            # fallback: encode single
            emb_a = np.array([embedding_model.encode(t, convert_to_numpy=True) for t in batch_a])
            emb_b = np.array([embedding_model.encode(t, convert_to_numpy=True) for t in batch_b])
        all_emb_a.append(emb_a)
        all_emb_b.append(emb_b)
    all_emb_a = np.vstack(all_emb_a)
    all_emb_b = np.vstack(all_emb_b)

    # cosine similarities
    print("Computing embedding similarities...")
    from sentence_transformers import util
    emb_sims = util.cos_sim(all_emb_a, all_emb_b).diagonal().cpu().numpy() if hasattr(util.cos_sim(all_emb_a, all_emb_b), 'cpu') else np.array([float(util.cos_sim(all_emb_a[i], all_emb_b[i]).item()) for i in range(N)])
    # fallback robust way if above fails
    if emb_sims.shape[0] != N:
        emb_sims = np.array([float(util.cos_sim(all_emb_a[i], all_emb_b[i]).item()) for i in range(N)])

    # cross-encoder in batches if requested
    cross_scores = np.zeros((N,), dtype=float)
    if use_cross and cross_encoder is not None:
        print("Running cross-encoder (this may be slow)...")
        pairs_for_cross = [[texts_a[i], texts_b[i]] for i in range(N)]
        for i in tqdm(range(0, N, batch_size)):
            batch = pairs_for_cross[i:i+batch_size]
            try:
                sc = cross_encoder.predict(batch, show_progress_bar=False)
            except Exception:
                sc = [0.0]*len(batch)
            for j, v in enumerate(sc):
                cross_scores[i+j] = float(v)

    # BM25 and lexical and AI-prob (per pair)
    print("Computing BM25, lexical, and AI-prob features...")
    for i in tqdm(range(N)):
        a = texts_a[i]
        b = texts_b[i]
        bm25_sc = build_bm25_score(a, b)
        lex_sc = jaccard_char_trigrams(a, b)
        ai_p = 0.0
        if use_ai and AI_AVAILABLE:
            try:
                ai_p = detect_ai_probability(b)
            except Exception:
                ai_p = 0.0
        X[i,0] = float(emb_sims[i]) if not math.isnan(emb_sims[i]) else 0.0
        X[i,1] = float(bm25_sc)
        X[i,2] = float(cross_scores[i]) if cross_scores is not None else 0.0
        X[i,3] = float(lex_sc)
        X[i,4] = float(ai_p)
        y[i] = int(labels[i])
    return X, y

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--dataset", type=str, default="stsb", help="Which dataset: stsb | paws | custom")
    p.add_argument("--csv", type=str, default="", help="Path to custom CSV (if dataset=custom). CSV should have text_a,text_b,label")
    p.add_argument("--sample", type=int, default=5000, help="Max number of pairs to sample")
    p.add_argument("--batch-size", type=int, default=64, help="Batch size for model encoding and cross-encoder")
    p.add_argument("--use-cross", action="store_true", help="Use cross-encoder re-rank scores as feature")
    p.add_argument("--use-ai", action="store_true", help="Use ai_detector output as feature (may be slow)")
    p.add_argument("--out", type=str, default="fusion_model.pkl", help="Output pickle path")
    args = p.parse_args()

    print("Configuration:", args)

    # load embedding model
    EMB = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-mpnet-base-v2")
    print("Loading embedding model:", EMB)
    embedding_model = SentenceTransformer(EMB)

    cross_encoder = None
    if args.use_cross:
        CROSS = os.getenv("CROSS_ENCODER_MODEL", "cross-encoder/ms-marco-MiniLM-L-6-v2")
        try:
            print("Loading cross-encoder:", CROSS)
            cross_encoder = CrossEncoder(CROSS)
        except Exception as e:
            print("Cross-encoder load failed:", e)
            cross_encoder = None

    pairs = []
    if args.dataset in ("stsb", "paws"):
        print(f"Loading dataset: {args.dataset}")
        pairs = load_text_pairs_from_dataset(args.dataset, sample=args.sample)
    elif args.dataset == "custom":
        if not args.csv:
            print("ERROR: --csv must be provided for dataset=custom")
            sys.exit(1)
        pairs = load_pairs_from_csv(args.csv, sample=args.sample)
    else:
        print("Unsupported dataset. Use stsb, paws, or custom CSV.")
        sys.exit(1)

    if not pairs:
        print("No pairs loaded. Exiting.")
        sys.exit(1)

    print(f"Loaded {len(pairs)} pairs. Computing features...")
    X, y = compute_features_for_pairs(pairs,
                                      embedding_model,
                                      cross_encoder,
                                      use_cross=args.use_cross,
                                      use_ai=args.use_ai and AI_AVAILABLE,
                                      batch_size=args.batch_size)

    # Normalize features with MinMaxScaler and save scaler with model
    print("Normalizing features with MinMaxScaler...")
    from sklearn.preprocessing import MinMaxScaler
    scaler = MinMaxScaler()
    X_scaled = scaler.fit_transform(X)

    # Train logistic regression
    print("Training logistic regression fusion model...")
    X_train, X_val, y_train, y_val = train_test_split(X_scaled, y, test_size=0.2, random_state=42, stratify=y if len(set(y))>1 else None)
    clf = LogisticRegression(max_iter=2000, class_weight="balanced")
    clf.fit(X_train, y_train)

    # Evaluate
    probs = clf.predict_proba(X_val)[:,1] if hasattr(clf, "predict_proba") else clf.decision_function(X_val)
    preds = (probs >= 0.5).astype(int)
    acc = accuracy_score(y_val, preds)
    f1 = f1_score(y_val, preds, zero_division=0)
    auc = roc_auc_score(y_val, probs) if len(set(y_val))>1 else float("nan")
    print(f"Validation metrics -> Acc: {acc:.4f} | F1: {f1:.4f} | AUC: {auc:.4f}")

    # save model + scaler together
    obj = {"model": clf, "scaler": scaler}
    with open(args.out, "wb") as fh:
        pickle.dump(obj, fh)
    print("Saved fusion model + scaler to", args.out)
    print("Done.")

if __name__ == "__main__":
    main()
