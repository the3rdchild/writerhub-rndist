"""
AI grammar checker. Provider datang dari payload job. Returns same issue-dict
shape as rule-based checkers.
Fallback: caller gets empty list and falls through to standard mode.
"""

import json
import logging

import requests

from services.analyzers.llm_client import language_name

logger = logging.getLogger(__name__)

_TIMEOUT = 90
_CONTRACT = (
    "Analyze the given text and return every error you find.\n\n"
    "For each error produce a JSON object with these exact keys:\n"
    '  "original"    : the exact substring that is wrong (must exist verbatim in the text)\n'
    '  "replacement" : the corrected version of that substring\n'
    '  "type"        : short label, e.g. "Verb tense", "Subject-verb agreement", "Spelling", "Wordiness"\n'
    '  "category"    : one of "grammar" | "spelling" | "style"\n'
    '  "offset"      : 0-indexed character position where original starts in the text\n'
    '  "length"      : character length of original (must equal len(original))\n\n'
    "Respond ONLY with a JSON object: {\"suggestions\": [...]}.\n"
    "Quote `original` verbatim from the text, long enough to be unambiguous.\n"
    "If the text has no errors, return {\"suggestions\": []}."
)
_MULTI_LANG_NOTE = (
    "A document's primary language does not have to apply to every passage. "
    "If a passage is unambiguously written in a different language on purpose "
    "- a quotation, a proper noun, a technical term, an abstract, a heading, "
    "or another deliberate switch (e.g. an English abstract inside an "
    "otherwise Indonesian paper) - judge that passage by the grammar of the "
    "language it is actually written in, not the document's primary language, "
    "and do not flag the language switch itself as an error. Never turn a "
    "correctly-spelled word from one language into a similar-sounding word "
    "from another language; that rule applies in both directions.\n\n"
)

_SYSTEM = (
    "You are a professional English grammar, spelling, and style checker.\n"
    + _MULTI_LANG_NOTE
    + _CONTRACT
)


def _system_prompt(language: str | None) -> str:
    """
    Prompt checker untuk bahasa naskah.

    Tanpa nama bahasa, model menganggap teksnya Inggris dan "memperbaiki" kata
    bahasa lain jadi kata Inggris yang mirip bunyi - `salah` jadi `salad`,
    `mata` jadi `data`. Pelajarannya sudah dicatat di llm_client: perintah
    "keep the original language" saja KALAH; bahasanya harus disebut namanya
    di depan. Tapi menyebut satu nama bahasa untuk SELURUH naskah menciptakan
    bug baliknya pada dokumen multi-bahasa yang sah (lihat _MULTI_LANG_NOTE) -
    karena itu klausa itu selalu disertakan, bukan cuma pengecualian.
    """
    if not language:
        return _SYSTEM
    name = language_name(language)
    if name == "English":
        return _SYSTEM
    return (
        f"You are a professional grammar, spelling, and style checker for {name} text.\n"
        f"The text is primarily written in {name}. Judge {name} passages against the "
        f"rules of {name}, never against English: a {name} word is not a misspelled "
        f"English word, and a correct {name} sentence is not an error. Replacements "
        f"you propose for {name} passages must themselves be written in {name}.\n"
        + _MULTI_LANG_NOTE
        + _CONTRACT
    )


def _resolve_offset(text: str, original: str, hint: int | None) -> int | None:
    """
    Cari posisi sebenarnya `original` di dalam teks.

    Model bahasa tidak bisa menghitung posisi karakter dengan andal - pada
    pengujian, 5-6 dari 6 offset yang dikembalikan meleset. Karena itu offset
    dari LLM hanya dipakai sebagai petunjuk untuk memilih kemunculan terdekat
    saat `original` muncul berkali-kali; posisinya sendiri selalu dihitung ulang
    dari teks. Mengembalikan None berarti `original` tidak ada di teks (halusinasi)
    dan suggestion-nya dibuang.

    Padanan sisi web ada di apps/web/features/document/suggestions.ts.
    """
    if not original:
        return None

    if hint is not None and hint >= 0 and text[hint : hint + len(original)] == original:
        return hint

    best: int | None = None
    best_distance = float("inf")
    start = 0
    while True:
        index = text.find(original, start)
        if index == -1:
            break
        distance = index if hint is None else abs(index - hint)
        if distance < best_distance:
            best_distance, best = distance, index
        start = index + 1

    return best


def check_ai_grammar(
    text: str,
    model_id: str | None,
    alias: str | None,
    is_nine_router: bool,
    base_url: str,
    api_key: str,
    sdk_provider: str,
    language: str | None = None,
) -> tuple[list[dict], int | None]:
    if sdk_provider != "openai":
        raise ValueError(f"sdk_provider '{sdk_provider}' belum didukung worker ini (cuma OpenAI-compatible).")

    model = alias if is_nine_router else model_id
    if not model:
        raise ValueError("Model tidak tersedia dari provider config.")
    if not api_key or not base_url:
        raise ValueError("baseUrl/apiKey tidak tersedia dari provider config.")

    total_tokens: int | None = None
    try:
        resp = requests.post(
            f"{base_url.rstrip('/')}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": _system_prompt(language)},
                    {"role": "user", "content": text},
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.2,
            },
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        body = resp.json()
        total_tokens = (body.get("usage") or {}).get("total_tokens")
        raw = json.loads(body["choices"][0]["message"]["content"])
        suggestions = raw.get("suggestions", [])
    except Exception as e:
        logger.warning("[ai_grammar] panggilan LLM gagal: %s", e)
        return [], None

    out = []
    dropped = 0
    for s in suggestions:
        try:
            original    = str(s.get("original", ""))
            replacement = str(s.get("replacement", ""))
            category    = s.get("category", "grammar")
            if category not in ("grammar", "spelling", "style"):
                category = "grammar"
            if not original or original == replacement:
                continue

            try:
                hint = int(s.get("offset"))
            except (TypeError, ValueError):
                hint = None

            offset = _resolve_offset(text, original, hint)
            if offset is None:
                dropped += 1
                continue

            out.append({
                "original":    original,
                "replacement": replacement,
                "type":        str(s.get("type", "Grammar error")),
                "category":    category,
                "offset":      offset,
                "length":      len(original),
                "prio":        0,
            })
        except Exception:
            continue

    if dropped:
        logger.warning("[ai_grammar] %d suggestion dibuang - `original` tidak ada di teks", dropped)

    return out, total_tokens
