"""
Humanizer - bikin teks yang kaku/AI-sounding jadi lebih natural, per kalimat.

Engine utama: DeepSeek API (satu batch request, prompt khusus humanize).
Fallback (tanpa model): per kalimat -
1. Substitusi frasa formal → natural (curated dict)
2. Kontraksi umum (do not → don't, dst.)
3. Pecah kalimat super panjang di konjungsi
Satu change per kalimat yang berubah, offset akurat di teks asli.
"""

import logging
import re

from services.analyzers.common import apply_sentence_rewrites, sentence_spans
from services.analyzers.llm_client import rewrite_sentences, style_memory_instruction
from core.provider import Provider

logger = logging.getLogger(__name__)

_INSTRUCTION = (
    "Rewrite each sentence so it sounds natural, conversational, and "
    "human-written: use contractions, simpler everyday words, and varied "
    "rhythm. Avoid stiff or formal AI-sounding phrasing. Keep the original "
    "meaning and language."
)
FORMAL_TO_NATURAL = {
    "it is important to note that": "note that",
    "it is worth mentioning that": "notably,",
    "it is worth noting that": "notably,",
    "it should be noted that": "note that",
    "in light of the fact that": "since",
    "due to the fact that": "because",
    "in the event that": "if",
    "for the purpose of": "for",
    "with regard to": "about",
    "with respect to": "about",
    "in accordance with": "following",
    "a large number of": "many",
    "a wide range of": "many",
    "the aforementioned": "the",
    "in order to": "to",
    "in conclusion": "to wrap up",
    "first and foremost": "first",
    "at this point in time": "now",
    "in the near future": "soon",
    "on a regular basis": "regularly",
    "in a timely manner": "promptly",
    "take into consideration": "consider",
    "furthermore": "also",
    "additionally": "plus",
    "moreover": "besides",
    "nevertheless": "still",
    "nonetheless": "still",
    "subsequently": "then",
    "consequently": "so",
    "approximately": "about",
    "utilize": "use",
    "utilization": "use",
    "facilitate": "help",
    "commence": "start",
    "terminate": "end",
    "endeavor": "try",
    "numerous": "many",
    "possess": "have",
    "obtain": "get",
    "demonstrate": "show",
    "indicate": "show",
    "implement": "set up",
    "leverage": "use",
    "ascertain": "find out",
    "regarding": "about",
    "sufficient": "enough",
    "prior to": "before",
}

CONTRACTIONS = {
    "do not": "don't",
    "does not": "doesn't",
    "did not": "didn't",
    "is not": "isn't",
    "are not": "aren't",
    "was not": "wasn't",
    "were not": "weren't",
    "cannot": "can't",
    "can not": "can't",
    "could not": "couldn't",
    "should not": "shouldn't",
    "would not": "wouldn't",
    "will not": "won't",
    "have not": "haven't",
    "has not": "hasn't",
    "had not": "hadn't",
    "it is": "it's",
    "that is": "that's",
    "there is": "there's",
    "they are": "they're",
    "we are": "we're",
    "you are": "you're",
    "i am": "I'm",
}


def _match_case(replacement: str, original: str) -> str:
    """Samain kapitalisasi huruf pertama dengan teks asli."""
    if original[:1].isupper() and replacement[:1].islower():
        return replacement[0].upper() + replacement[1:]
    return replacement


def _collect_matches(text: str, mapping: dict[str, str]) -> list[tuple[int, int, str, str]]:
    """
    Kumpulkan semua match dari mapping pada teks asli (sebelum substitusi apapun).
    Kembalikan list (start, end, original_str, replacement_str) yang sudah diurutkan
    dan tidak ada yang overlap.
    """
    raw: list[tuple[int, int, str, str]] = []
    for phrase in sorted(mapping, key=len, reverse=True):
        pattern = re.compile(r"\b" + re.escape(phrase) + r"\b", re.IGNORECASE)
        for m in pattern.finditer(text):
            repl = _match_case(mapping[phrase], m.group(0))
            raw.append((m.start(), m.end(), m.group(0), repl))
    raw.sort(key=lambda x: x[0])
    deduped: list[tuple[int, int, str, str]] = []
    last_end = -1
    for item in raw:
        if item[0] >= last_end:
            deduped.append(item)
            last_end = item[1]
    return deduped


def _apply_matches(text: str, matches: list[tuple[int, int, str, str]]) -> tuple[str, list[dict]]:
    """
    Terapkan substitusi satu-per-satu.
    Kembalikan (teks_baru, list_perubahan).
    Setiap perubahan: {original, replacement, offset, length}
    di mana offset adalah posisi di teks ASLI (inputText frontend).
    Frontend pakai offset ini untuk highlight dan accept satu-per-satu.
    """
    parts: list[str] = []
    changes: list[dict] = []
    cursor = 0

    for start, end, orig, repl in matches:
        parts.append(text[cursor:start])
        parts.append(repl)
        changes.append({
            "original": orig,
            "replacement": repl,
            "offset": start,   # offset di teks asli - bukan teks hasil
            "length": len(orig),
        })
        cursor = end

    parts.append(text[cursor:])
    return "".join(parts), changes


def _break_long_sentences(text: str) -> tuple[str, int]:
    """Pecah kalimat >35 kata di ', and' / ', but' / ', so' pertama setelah tengah."""
    count = 0
    out = []
    for sent in re.split(r"(?<=[.!?])\s+", text):
        n_words = len(sent.split())
        if n_words > 35:
            half = len(sent) // 2
            m = re.search(r",\s+(and|but|so)\s+", sent[half:])
            if m:
                cut = half + m.start()
                first = sent[:cut].rstrip(",") + "."
                conj = m.group(1)
                rest = sent[cut + len(m.group(0)):]
                rest = (conj.capitalize() if conj != "and" else "And") + " " + rest
                out.append(first + " " + rest)
                count += 1
                continue
        out.append(sent)
    return " ".join(out), count


def get_suggestion(text: str) -> str | None:
    """Versi humanized berbasis kamus, atau None kalau tidak ada perubahan.
    Dipakai ai_detector sebagai fallback saat API tidak tersedia."""
    combined = {**FORMAL_TO_NATURAL, **CONTRACTIONS}
    matches = _collect_matches(text, combined)
    if not matches:
        return None
    humanized, _ = _apply_matches(text, matches)
    return humanized if humanized != text else None


def _humanize_local(sentence: str) -> str:
    """Fallback tanpa model: substitusi kamus + pecah kalimat panjang."""
    combined = {**FORMAL_TO_NATURAL, **CONTRACTIONS}
    matches = _collect_matches(sentence, combined)
    humanized, _ = _apply_matches(sentence, matches)
    humanized, _ = _break_long_sentences(humanized)
    return humanized


def run_humanizer(
    text: str,
    provider: Provider,
    language: str | None = None,
    style_memory: dict | None = None,
) -> dict:
    """
    Returns HumanizerResult:
    { humanized_text: str, changes: [{original, replacement, offset, length}], changes_count: int }
    Satu change per kalimat yang berubah (bukan per frasa).
    `style_memory` = AI Memory user; cuma ngaruh ke jalur LLM - fallback kamus
    lokal sengaja dibiarkan, heuristik ga bisa nurutin preferensi gaya.
    """
    spans = sentence_spans(text)
    stripped = [sent.strip() for sent, _ in spans]

    instruction = _INSTRUCTION + style_memory_instruction(style_memory)
    humanized_all = rewrite_sentences(stripped, instruction, provider, language)
    if humanized_all is not None:
        logger.info("[humanizer] pakai LLM (%d kalimat)", len(stripped))
    else:
        humanized_all = [_humanize_local(s) for s in stripped]

    humanized_text, changes = apply_sentence_rewrites(text, spans, humanized_all)
    logger.info("[humanizer] %d kalimat berubah", len(changes))
    return {
        "humanized_text": humanized_text,
        "changes": changes,
        "changes_count": len(changes),
    }
