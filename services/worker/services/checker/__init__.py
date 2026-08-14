"""
Engine grammar pure-Python (NO AI, NO Java).

Gabungin 3 checker:
  - spelling.py      → pyspellchecker
  - grammar_rules.py → rule-engine regex/heuristik
  - style.py         → curated wordiness + proselint (best-effort)

Lalu resolve overlap, build suggestions (shape FE), corrected_text, sama scores.
Output shape:
  {
    "suggestions":     [ {id, type, category, original, replacement, offset, length}, ... ],
    "scores":          {grammar, fluency, clarity, engagement},   # 0..100
    "writing_quality": int,
    "quality_label":   "Excellent" | "Good" | "Average" | "Needs Work",
    "corrected_text":  str,
  }
"""

import logging

from .spelling import check_spelling
from .grammar_rules import check_grammar
from .grammar_pos import check_grammar_pos
from .confusion import check_confusion
from .collocation import check_collocation
from .advanced import check_advanced
from .structure import check_structure
from .style import check_style
from .scoring import compute_scores

logger = logging.getLogger(__name__)


def analyze_grammar(
    text: str,
    language: str = "en",
    model: str = "standard",
    on_checkpoint=None,       # callable(suggestions: list[dict]) - dipanggil setiap checker selesai
    provider=None,
) -> dict:
    text = text or ""

    if model == "ai":
        if provider is None:
            raise ValueError("Provider LLM wajib ada untuk model 'ai'.")
        from .ai_grammar import check_ai_grammar
        ai_raw, ai_total_tokens = check_ai_grammar(
            text,
            model_id=provider.model_id,
            alias=provider.alias,
            is_nine_router=provider.is_nine_router,
            base_url=provider.base_url,
            api_key=provider.api_key,
            sdk_provider=provider.sdk_provider,
            # Bahasa naskah WAJIB sampai ke prompt - tanpanya model menganggap
            # teksnya Inggris dan "memperbaiki" kata bahasa lain jadi kata
            # Inggris yang mirip bunyi (salah→salad, mata→data).
            language=language,
        )
        if ai_raw:
            cleaned  = _clean(text, ai_raw)
            chosen   = _resolve_overlaps(cleaned)
            suggestions = [
                {
                    "id":          str(idx),
                    "type":        i["type"],
                    "category":    i["category"],
                    "original":    i["original"],
                    "replacement": i["replacement"],
                    "offset":      i["offset"],
                    "length":      i["length"],
                }
                for idx, i in enumerate(chosen, start=1)
            ]
            corrected_text = _apply(text, chosen)
            scores, writing_quality, quality_label = compute_scores(text, chosen)
            return {
                "suggestions":    suggestions,
                "scores":         scores,
                "writing_quality": writing_quality,
                "quality_label":  quality_label,
                "corrected_text": corrected_text,
                "total_tokens":   ai_total_tokens,
            }
        # Naskah non-Inggris tidak punya fallback yang masuk akal: checker
        # berbasis aturan berdiri di atas kamus Inggris, jadi "cadangan" baginya
        # adalah saran yang SALAH, bukan saran yang sedikit. Kosong lebih jujur -
        # pengguna bisa mencoba lagi.
        if language and language.split("-")[0].lower() != "en":
            logger.info("[checker] AI gagal untuk bahasa '%s'; fallback aturan-Inggris dilewati", language)
            scores, writing_quality, quality_label = compute_scores(text, [])
            return {
                "suggestions":    [],
                "scores":         scores,
                "writing_quality": writing_quality,
                "quality_label":  quality_label,
                "corrected_text": text,
                "total_tokens":   ai_total_tokens,
            }
        logger.info("[checker] AI model fallback ke rule-based")

    raw: list[dict] = []
    for name, fn in (
        ("spelling", lambda: check_spelling(text, language)),
        ("grammar", lambda: check_grammar(text)),
        ("grammar-pos", lambda: check_grammar_pos(text)),
        ("confusion", lambda: check_confusion(text)),
        ("collocation", lambda: check_collocation(text)),
        ("advanced", lambda: check_advanced(text)),
        ("structure", lambda: check_structure(text)),
        ("style", lambda: check_style(text)),
    ):
        try:
            new_issues = fn()
            raw += new_issues
            # Kirim snapshot suggestion yang sudah resolved sejauh ini
            if on_checkpoint and new_issues:
                try:
                    partial_cleaned = _clean(text, list(raw))
                    partial_chosen = _resolve_overlaps(partial_cleaned)
                    partial_suggestions = [
                        {
                            "id": str(idx),
                            "type": i["type"],
                            "category": i["category"],
                            "original": i["original"],
                            "replacement": i["replacement"],
                            "offset": i["offset"],
                            "length": i["length"],
                        }
                        for idx, i in enumerate(partial_chosen, start=1)
                    ]
                    on_checkpoint(partial_suggestions)
                except Exception:
                    pass
        except Exception:
            logger.exception("[checker] %s gagal, dilewatin", name)

    cleaned = _clean(text, raw)
    chosen = _resolve_overlaps(cleaned)

    suggestions = [
        {
            "id": str(idx),
            "type": i["type"],
            "category": i["category"],
            "original": i["original"],
            "replacement": i["replacement"],
            "offset": i["offset"],
            "length": i["length"],
        }
        for idx, i in enumerate(chosen, start=1)
    ]

    corrected_text = _apply(text, chosen)
    scores, writing_quality, quality_label = compute_scores(text, chosen)

    return {
        "suggestions": suggestions,
        "scores": scores,
        "writing_quality": writing_quality,
        "quality_label": quality_label,
        "corrected_text": corrected_text,
        "total_tokens": None,
    }


def _clean(text: str, issues: list[dict]) -> list[dict]:
    """Buang issue invalid / no-op, sama slice `original` dari teks (dijamin exact substring)."""
    out = []
    n = len(text)
    for i in issues:
        off, ln = i.get("offset", -1), i.get("length", 0)
        if off < 0 or ln <= 0 or off + ln > n:
            continue
        original = text[off : off + ln]
        repl = i.get("replacement", "")
        if repl == original:  # no-op, skip
            continue
        i["original"] = original
        out.append(i)
    return out


def _resolve_overlaps(issues: list[dict]) -> list[dict]:
    """Priority-greedy: issue prioritas tinggi (prio kecil) ditaruh duluan; yang
    overlap sama yang udah kepilih dibuang. Hasil akhir diurut by offset (reading order)."""
    issues = sorted(issues, key=lambda i: (i.get("prio", 1), i["offset"]))
    chosen: list[dict] = []
    for i in issues:
        s, e = i["offset"], i["offset"] + i["length"]
        if any(not (e <= c["offset"] or s >= c["offset"] + c["length"]) for c in chosen):
            continue
        chosen.append(i)
    chosen.sort(key=lambda i: i["offset"])
    return chosen


def _apply(text: str, issues: list[dict]) -> str:
    """Terapin replacement dari kanan ke kiri biar offset tetep valid."""
    for i in sorted(issues, key=lambda x: x["offset"], reverse=True):
        text = text[: i["offset"]] + i["replacement"] + text[i["offset"] + i["length"] :]
    return text
