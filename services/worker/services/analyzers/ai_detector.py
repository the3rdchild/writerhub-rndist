"""
AI Detector - deteksi probabilitas teks dibuat AI per kalimat.

Primary: HuggingFace openai-community/roberta-base-openai-detector
(lazy-load + cache, pola sama dengan gec_model). Fallback: heuristik
statistik (panjang kalimat, lexical diversity, burstiness, frasa formal).
"""

import logging
import math
import re
import statistics

from services.analyzers.common import sentence_spans, words
from services.analyzers.humanizer import _INSTRUCTION as _HUMANIZE_INSTRUCTION
from services.analyzers.humanizer import get_suggestion
from services.analyzers.llm_client import rewrite_sentences
from core.provider import Provider

logger = logging.getLogger(__name__)



# --- Fallback heuristik ---

_FORMAL_PATTERNS = [
    r"\bit is important to note\b",
    r"\bit is worth (?:mentioning|noting)\b",
    r"\bin conclusion\b",
    r"\bfurthermore\b",
    r"\bmoreover\b",
    r"\badditionally\b",
    r"\bin today's .{1,30} (?:world|landscape|society)\b",
    r"\bdelve(?:s|d)? into\b",
    r"\ba (?:wide|broad) (?:range|array|variety) of\b",
    r"\bplays? a (?:crucial|vital|pivotal|significant) role\b",
    r"\bever-evolving\b",
    r"\bseamless(?:ly)?\b",
    r"\bleverag(?:e|ing)\b",
    r"\bholistic\b",
    r"\bparadigm\b",
]


def _heuristic_overall(text: str) -> int:
    """Skor AI 0-100 berbasis statistik teks (dipakai kalau model tak ada)."""
    sent_lens = [len(s.split()) for s, _ in sentence_spans(text)]
    toks = words(text)
    score = 25  # baseline netral-rendah

    # kalimat panjang seragam khas output LLM
    if sent_lens and (sum(sent_lens) / len(sent_lens)) > 25:
        score += 20

    # lexical diversity rendah (type-token ratio)
    if toks:
        ttr = len(set(toks)) / len(toks)
        if ttr < 0.6:
            score += 15

    # burstiness rendah = variasi panjang kalimat kecil
    if len(sent_lens) >= 3:
        mean = sum(sent_lens) / len(sent_lens)
        stdev = statistics.pstdev(sent_lens)
        if mean > 0 and (stdev / mean) < 0.35:
            score += 15

    # frasa formal/akademik khas AI
    hits = sum(1 for p in _FORMAL_PATTERNS if re.search(p, text, re.IGNORECASE))
    score += min(hits * 5, 20)

    return max(0, min(100, score))


def _heuristic_sentence(sentence: str, overall: int) -> int:
    """Skor per kalimat: overall ± penalti panjang/frasa formal."""
    score = overall
    n_words = len(sentence.split())
    if n_words > 25:
        score += 10
    elif n_words < 8:
        score -= 10
    if any(re.search(p, sentence, re.IGNORECASE) for p in _FORMAL_PATTERNS):
        score += 15
    return max(0, min(100, score))


def _label(score: int) -> str:
    if score < 30:
        return "Human"
    if score <= 70:
        return "Mixed"
    return "AI-Generated"


def _fill_suggestions(
    sentences: list[dict], provider: Provider, language: str | None = None
) -> None:
    """Isi suggested rewrite untuk kalimat ber-skor >= 50 - satu batch call
    ai model untuk semuanya; fallback per kalimat terusin ke kamus humanizer."""
    flagged = [s for s in sentences if s["score"] >= 50]
    if not flagged:
        return

    via_api = rewrite_sentences([s["text"] for s in flagged], _HUMANIZE_INSTRUCTION, provider, language)
    if via_api is not None:
        for s, rewritten in zip(flagged, via_api):
            s["suggestion"] = rewritten if rewritten != s["text"] else None
        return

    for s in flagged:
        s["suggestion"] = get_suggestion(s["text"])


def run_ai_detector(text: str, provider: Provider, language: str | None = None) -> dict:
    """
    Returns AiDetectorResult:
    { overall_score: int, label: str, sentences: [{text, score, offset, length}] }
    """
    spans = sentence_spans(text)

    sentences = []
    scores = []
    heuristic_overall = _heuristic_overall(text)

    for sent, offset in spans:
        stripped = sent.rstrip()
        score = _heuristic_sentence(stripped, heuristic_overall)
        scores.append(score)
        sentences.append({
            "text": stripped,
            "score": score,
            "offset": offset,
            "length": len(stripped),
            "suggestion": None,
        })

    _fill_suggestions(sentences, provider, language)

    overall = round(sum(scores) / len(scores)) if scores else 0
    return {
        "overall_score": overall,
        "label": _label(overall),
        "sentences": sentences,
    }
