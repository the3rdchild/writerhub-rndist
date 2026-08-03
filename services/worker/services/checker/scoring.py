"""
Scoring heuristik (NO AI) — diturunin dari densitas error + readability (textstat).

scores: {grammar, fluency, clarity, engagement} 0..100
writing_quality = rata-rata; quality_label samain ambang FE.
"""

import re
import logging

import textstat

logger = logging.getLogger(__name__)


def _clamp(x: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, x))


def _safe(fn, default: float) -> float:
    try:
        return float(fn())
    except Exception:
        return default


def compute_scores(text: str, issues: list[dict]) -> tuple[dict, int, str]:
    words = re.findall(r"\b\w+\b", text)
    w = max(len(words), 1)

    g = sum(1 for i in issues if i["category"] == "grammar")
    s = sum(1 for i in issues if i["category"] == "spelling")
    st = sum(1 for i in issues if i["category"] == "style")

    g100 = g / w * 100
    s100 = s / w * 100
    st100 = st / w * 100

    flesch = _clamp(_safe(lambda: textstat.flesch_reading_ease(text), 60.0))
    sentences = max(int(_safe(lambda: textstat.sentence_count(text), 1)), 1)
    avg_sent_len = w / sentences
    # penalti kalimat kepanjangan (run-on): cuma di atas 30 kata, di-cap biar ga 0
    long_pen = min(25.0, max(0.0, (avg_sent_len - 30) * 0.8))

    unique = len({x.lower() for x in words})
    lexical_diversity = unique / w  # 0..1

    error_density_pen = (g100 + s100) * 1.3
    style_pen = st100 * 2

    grammar = _clamp(100 - 5 * g100 - 7 * s100)
    fluency = _clamp(100 - 4 * g100 - 4 * st100 - long_pen)
    clarity = _clamp(0.45 * flesch + 0.55 * (100 - error_density_pen))
    engagement = _clamp(0.4 * flesch + 0.35 * lexical_diversity * 100 + 0.25 * (100 - style_pen))

    scores = {
        "grammar": round(grammar),
        "fluency": round(fluency),
        "clarity": round(clarity),
        "engagement": round(engagement),
    }

    writing_quality = round(sum(scores.values()) / 4)
    if writing_quality >= 90:
        label = "Excellent"
    elif writing_quality >= 75:
        label = "Good"
    elif writing_quality >= 60:
        label = "Average"
    else:
        label = "Needs Work"

    return scores, writing_quality, label
