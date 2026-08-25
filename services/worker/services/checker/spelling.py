"""
Spelling check pakai pyspellchecker (pure-Python, no Java).

Tiap kata yang ga dikenal kamus → diusulin koreksi paling mungkin.
Biar minim false-positive:
  - skip kontraksi (ada apostrof), akronim ALL-CAPS, kata < 3 huruf
  - skip kata Kapital di tengah kalimat (heuristik nama orang/tempat)
"""

import re
import logging
import unicodedata

from spellchecker import SpellChecker

logger = logging.getLogger(__name__)

_WORD_RE = re.compile(r"[A-Za-z][A-Za-z']*")


def _strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))
_cache: dict[str, SpellChecker] = {}
_MAX_WORD_LEN = 15


def _get_spell(language: str) -> SpellChecker:
    if language not in _cache:
        try:
            _cache[language] = SpellChecker(language=language, distance=1)
        except Exception:
            logger.warning("[spelling] bahasa '%s' ga didukung, fallback ke 'en'", language)
            _cache[language] = SpellChecker(language="en", distance=1)
    return _cache[language]


def _sentence_starts(text: str) -> set[int]:
    """Offset huruf pertama tiap kalimat (buat heuristik kapital)."""
    starts = {len(text) - len(text.lstrip())}  # awal teks (lewatin whitespace)
    for m in re.finditer(r"[.!?]+\s+", text):
        starts.add(m.end())
    return starts


def check_spelling(text: str, language: str = "en") -> list[dict]:
    spell = _get_spell(language)
    sent_starts = _sentence_starts(text)
    issues: list[dict] = []
    corr_cache: dict[str, str | None] = {}

    for m in _WORD_RE.finditer(text):
        word = m.group()
        start = m.start()

        if "'" in word:
            continue  # kontraksi (don't, I'll), kamus ga punya
        if word.isupper() and len(word) > 1:
            continue  # akronim (NASA, API)

        core = word.lower()
        if len(core) < 3 or len(core) > _MAX_WORD_LEN:
            continue
        if word[0].isupper() and start not in sent_starts:
            continue

        if core in corr_cache:
            correction = corr_cache[core]
        elif spell.known([core]):
            corr_cache[core] = None
            continue
        else:
            correction = spell.correction(core)
            corr_cache[core] = correction
        if not correction or correction == core:
            continue
        if _strip_accents(correction).lower() == _strip_accents(core).lower():
            continue

        if word[0].isupper():
            correction = correction[:1].upper() + correction[1:]

        issues.append(
            {
                "offset": start,
                "length": len(word),
                "replacement": correction,
                "type": "Spelling error",
                "category": "spelling",
                "prio": 1,
            }
        )

    return issues
