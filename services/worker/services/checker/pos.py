"""
POS tagging - fasad tipis di atas provider (lihat pos_providers.py).

`tag(text)` milih provider aktif: spaCy (utama) → AI (fallback) → [] (kalau
dua-duanya ga ada). Konsumen (grammar_pos / advanced / structure / confusion)
cukup `from .pos import tag` - ga peduli provider mana yang dipakai.

Hasil di-cache per-teks (1 entri): dalam 1 job, ke-4 checker manggil tag() dengan
teks yang sama → provider cuma dieksekusi sekali (penting buat AI provider yang
nge-hit API).
"""

import logging

from .pos_providers import resolve_provider

logger = logging.getLogger(__name__)

_cache: tuple[str, list[tuple[str, str, int, int]]] | None = None


def tag(text: str) -> list[tuple[str, str, int, int]]:
    """
    Balikin list (word, penn_tag, offset, length).
    Tanda baca disertakan (pembatas alami), whitespace di-skip.
    [] kalau ga ada provider aktif / gagal.
    """
    global _cache
    if _cache is not None and _cache[0] == text:
        return _cache[1]

    provider = resolve_provider()
    result = provider.tag(text) if provider else []

    _cache = (text, result)
    return result
