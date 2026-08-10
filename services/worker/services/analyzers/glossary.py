"""
Glosarium - susun daftar istilah beserta definisinya dari naskah.

Dua tahap, dan pembagiannya yang membuat fitur ini sanggup memakan dokumen
sepanjang apa pun:

1. Pemindaian LOKAL tanpa LLM mencari kandidat istilah (akronim dan frasa yang
   berulang). Ini yang membaca seluruh naskah, dan biayanya nol token.
2. SATU panggilan LLM menerima daftar kandidat itu - bukan naskahnya - lalu
   membuang yang bukan istilah dan menuliskan definisinya.

Bandingkan dengan AI Rewriter yang wajib mengirim seluruh kalimat karena harus
mengembalikan satu keluaran per masukan: glosarium tidak butuh alignment, hanya
butuh menemukan istilah. Karena itu biayanya nyaris tidak bergantung pada
panjang dokumen, dan naskah 50.000 karakter tetap satu permintaan kecil.

Konsekuensi yang diterima: istilah yang cuma muncul sekali tidak terjaring.
Glosarium memang untuk istilah yang berulang, jadi frekuensi dipakai sebagai
penyaring, bukan sekadar jalan pintas.
"""

import logging
import re
from collections import Counter

from services.analyzers.llm_client import define_terms
from core.provider import Provider

logger = logging.getLogger(__name__)

# Sebanyak-banyaknya kandidat yang dikirim ke LLM. Lebih dari ini hanya
# menambah token tanpa menambah istilah yang layak masuk daftar.
MAX_CANDIDATES = 60

# Akronim: 2-6 huruf kapital, boleh berangka (mis. "AKD", "GPT4").
_ACRONYM = re.compile(r"\b[A-Z][A-Z0-9]{1,5}\b")

# Frasa berkapital 1-3 kata (mis. "Analisis Komponen Data"). Kata pertama
# kalimat ikut terjaring - disaring lagi lewat ambang frekuensi di bawah.
_CAPPED = re.compile(r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b")

# Kata yang sering berkapital karena posisi, bukan karena istilah.
_STOPWORDS = {
    "the", "this", "that", "and", "for", "with", "from", "into",
    "ini", "itu", "dan", "atau", "untuk", "dengan", "dari", "pada",
    "yang", "adalah", "dalam", "oleh", "sebagai", "bab", "gambar", "tabel",
}


def _normalize(term: str) -> str:
    return re.sub(r"\s+", " ", term).strip()


def extract_candidates(text: str, limit: int = MAX_CANDIDATES) -> list[tuple[str, int]]:
    """
    Kandidat istilah beserta jumlah kemunculannya, terbanyak di depan.

    Fungsi murni tanpa LLM supaya bisa diuji sendiri - dan supaya bagian yang
    membaca seluruh naskah tidak pernah menjadi biaya token.

    Akronim diterima walau muncul sekali (kemunculannya sendiri sudah sinyal
    kuat); frasa berkapital baru diterima kalau berulang, karena satu kali
    kemunculan biasanya hanya kata pertama kalimat.
    """
    counts: Counter[str] = Counter()

    for match in _ACRONYM.finditer(text):
        counts[_normalize(match.group())] += 1

    phrase_counts: Counter[str] = Counter()
    for match in _CAPPED.finditer(text):
        phrase = _normalize(match.group())
        if phrase.lower() in _STOPWORDS:
            continue
        # Frasa satu kata yang sudah terhitung sebagai akronim tidak dihitung dua kali.
        if phrase in counts:
            continue
        phrase_counts[phrase] += 1

    for phrase, n in phrase_counts.items():
        if n > 1:
            counts[phrase] += n

    ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0].lower()))
    return ranked[:limit]


def sample_sentence(text: str, term: str) -> str:
    """Satu kalimat tempat istilah muncul, sebagai konteks bagi LLM."""
    index = text.find(term)
    if index == -1:
        return ""
    start = max(0, text.rfind(".", 0, index) + 1)
    end = text.find(".", index)
    end = len(text) if end == -1 else end + 1
    return text[start:end].strip()[:300]


def run_glossary(
    text: str,
    provider: Provider,
    language: str | None = None,
    style_memory: dict | None = None,
) -> dict:
    """
    Returns GlossaryResult: { entries: [{term, definition, occurrences}], ... }
    """
    candidates = extract_candidates(text)
    if not candidates:
        logger.info("[glossary] tidak ada kandidat istilah di naskah ini")
        return {"entries": []}

    payload = [
        {"term": term, "occurrences": n, "context": sample_sentence(text, term)}
        for term, n in candidates
    ]

    defined = define_terms(payload, provider, language, style_memory)
    if defined is None:
        logger.warning("[glossary] LLM tidak tersedia - daftar istilah tidak dibuat")
        return {"entries": [], "llm_unavailable": True}

    occurrences = dict(candidates)
    entries = [
        {
            "term": item["term"],
            # Kunci `expansion` selalu ada tapi boleh kosong; web yang memutuskan
            # menampilkannya atau tidak.
            "expansion": item.get("expansion") or "",
            "definition": item["definition"],
            "occurrences": occurrences.get(item["term"], 1),
        }
        for item in defined
    ]
    entries.sort(key=lambda entry: entry["term"].lower())

    logger.info("[glossary] %d kandidat → %d istilah", len(candidates), len(entries))
    return {"entries": entries}
