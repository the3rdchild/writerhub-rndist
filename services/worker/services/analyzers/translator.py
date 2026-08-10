"""
Translator - terjemahkan naskah ke bahasa tujuan lewat LLM.

Hasilnya sengaja berbentuk sama dengan AI Rewriter: satu change per kalimat,
dengan offset menunjuk kalimat di teks ASLI. Dengan begitu panel, highlight
layer, dan alur apply yang sudah ada bisa dipakai ulang apa adanya - dan yang
lebih penting, penggantian tetap per rentang teks sehingga format dokumen
(heading, tabel, tebal) tidak ikut diratakan seperti kalau seluruh naskah
ditimpa sekaligus.
"""

import logging

from services.analyzers.common import apply_sentence_rewrites, sentence_spans
from services.analyzers.llm_client import translate_sentences
from core.provider import Provider

logger = logging.getLogger(__name__)


def run_translator(
    text: str,
    provider: Provider,
    language: str | None = None,
    style_memory: dict | None = None,
    target_lang: str | None = None,
) -> dict:
    """
    Returns TranslatorResult:
    { translated_text: str, changes: [...], detected_language?, llm_unavailable? }

    `language` = bahasa sumber menurut editor (sekadar dilaporkan balik),
    `target_lang` = bahasa tujuan, `style_memory` = AI Memory user - glossary di
    dalamnya yang paling berguna di sini: nama produk dan istilah teknis tidak
    ikut dialihbahasakan.
    """
    if not target_lang:
        # Seharusnya sudah ditolak validasi API; dijaga di sini supaya worker
        # tidak diam-diam menerjemahkan ke bahasa yang tidak diminta siapa pun.
        raise ValueError("target_lang wajib diisi untuk fitur translator")

    spans = sentence_spans(text)
    stripped = [sent.strip() for sent, _ in spans]

    translated = translate_sentences(stripped, target_lang, provider, style_memory)
    if translated is None:
        logger.warning("[translator] LLM tidak tersedia - teks dikembalikan apa adanya")
        return {
            "translated_text": text,
            "changes": [],
            "detected_language": language,
            "llm_unavailable": True,
        }

    logger.info("[translator] %d kalimat → %s", len(stripped), target_lang)
    translated_text, changes = apply_sentence_rewrites(text, spans, translated)
    return {
        "translated_text": translated_text,
        "changes": changes,
        "detected_language": language,
    }
