"""
AI Rewriter - tulis ulang teks untuk clarity/style.

Engine utama: DeepSeek API (satu batch request untuk semua kalimat).
Fallback: coedit-large lokal (reuse model GEC tier advanced di gec_model).
Kalau dua-duanya tak tersedia: balikin teks apa adanya tanpa changes.
"""

import logging

from services.analyzers.common import apply_sentence_candidates, sentence_spans
from services.analyzers.llm_client import rewrite_sentences_candidates, style_memory_instruction
from core.provider import Provider

logger = logging.getLogger(__name__)
_INSTRUCTION = (
    "Rephrase each sentence so it reads more clearly and flows better, even "
    "when it is already correct. Fix any grammar mistakes along the way. Keep "
    "the original meaning, tone, and language."
)

def _rewrite_all(
    stripped: list[str],
    provider: Provider,
    language: str | None = None,
    style_memory: dict | None = None,
) -> tuple[list[list[str]], bool]:
    """
    Rewrite semua kalimat lewat LLM, DUA alternatif per kalimat supaya pengguna
    bisa memilih di panel. Selalu balikin list sepanjang input; tiap elemen
    berisi 1-2 kandidat.

    Balikan kedua menandakan apakah LLM benar-benar terpakai. Fallback saat LLM
    tak tersedia membuat tiap kalimat jadi kandidat tunggal berisi dirinya
    sendiri - di hilir itu terbaca sebagai "tidak ada perubahan", dan tanpa
    penanda ini panel akan mengabarkannya sebagai naskah yang sudah baik.
    """
    instruction = _INSTRUCTION + style_memory_instruction(style_memory)
    via_api = rewrite_sentences_candidates(stripped, instruction, provider, language)
    if via_api is not None:
        return via_api, True

    logger.warning("[ai_rewriter] LLM tidak tersedia - teks dikembalikan apa adanya")
    return [[sentence] for sentence in stripped], False


def run_ai_rewriter(
    text: str,
    provider: Provider,
    language: str | None = None,
    style_memory: dict | None = None,
) -> dict:
    """
    Returns AiRewriterResult:
    { rewritten_text: str, changes: [{original, replacement, offset, length,
      candidates?}] }
    Satu change per kalimat yang berubah (bukan per kata), masing-masing membawa
    sampai dua alternatif untuk dipilih pengguna di panel.
    `style_memory` = AI Memory user (termasuk tone pilihan panel yang menimpanya),
    ditempel ke prompt sebagai instruksi gaya.
    """
    spans = sentence_spans(text)
    stripped = [sent.strip() for sent, _ in spans]
    candidates_all, llm_used = _rewrite_all(stripped, provider, language, style_memory)

    rewritten_text, changes = apply_sentence_candidates(text, spans, candidates_all)

    if llm_used:
        logger.info(
            "[ai_rewriter] pakai LLM | kalimat=%d | berubah=%d | punya_alternatif=%d",
            len(stripped),
            len(changes),
            sum(1 for candidates in candidates_all if len(candidates) > 1),
        )
        if not changes:
            logger.warning(
                "[ai_rewriter] model mengembalikan seluruh kalimat apa adanya - "
                "tidak ada usulan yang bisa ditampilkan"
            )

    result = {"rewritten_text": rewritten_text, "changes": changes}
    if not llm_used:
        result["llm_unavailable"] = True
    return result
