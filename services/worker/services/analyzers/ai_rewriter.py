"""
AI Rewriter — tulis ulang teks untuk clarity/style.

Engine utama: DeepSeek API (satu batch request untuk semua kalimat).
Fallback: coedit-large lokal (reuse model GEC tier advanced di gec_model).
Kalau dua-duanya tak tersedia: balikin teks apa adanya tanpa changes.
"""

import logging

from services.analyzers.common import apply_sentence_rewrites, sentence_spans
from services.analyzers.llm_client import rewrite_sentences
from core.provider import Provider

logger = logging.getLogger(__name__)

_INSTRUCTION = (
    "Rewrite each sentence to be clearer and easier to understand. Fix all "
    "grammar mistakes. Keep the original meaning, tone, and language."
)

def _rewrite_all(stripped: list[str], provider: Provider) -> list[str]:
    """Rewrite semua kalimat lewat LLM, fallback: teks dikembalikan apa adanya.
    Selalu balikin list sepanjang input (elemen tak berubah = kalimat asli)."""
    via_api = rewrite_sentences(stripped, _INSTRUCTION, provider)
    if via_api is not None:
        logger.info("[ai_rewriter] pakai LLM (%d kalimat)", len(stripped))
        return via_api

    logger.warning("[ai_rewriter] LLM tidak tersedia — teks dikembalikan apa adanya")
    return list(stripped)


def run_ai_rewriter(text: str, provider: Provider) -> dict:
    """
    Returns AiRewriterResult:
    { rewritten_text: str, changes: [{original, replacement, offset, length}] }
    Satu change per kalimat yang berubah (bukan per kata).
    """
    spans = sentence_spans(text)
    stripped = [sent.strip() for sent, _ in spans]
    rewritten_all = _rewrite_all(stripped, provider)

    rewritten_text, changes = apply_sentence_rewrites(text, spans, rewritten_all)
    return {"rewritten_text": rewritten_text, "changes": changes}
