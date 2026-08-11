import json
import logging

import requests

from core.provider import Provider

logger = logging.getLogger(__name__)

_TIMEOUT = 60  # detik - satu batch request untuk semua kalimat

_last_total_tokens: int | None = None

# Kode BCP-47 -> nama bahasa dalam bahasa Inggris. Model jauh lebih patuh
# pada "Indonesian" daripada pada "id".
_LANGUAGE_NAMES = {
    "en": "English",
    "id": "Indonesian",
    "ms": "Malay",
    "es": "Spanish",
    "pt": "Portuguese",
    "fr": "French",
    "de": "German",
    "it": "Italian",
    "nl": "Dutch",
    "tr": "Turkish",
    "vi": "Vietnamese",
    "ja": "Japanese",
    "ko": "Korean",
    "zh": "Chinese",
    "ar": "Arabic",
    "ru": "Russian",
    "th": "Thai",
}


def language_name(code: str | None) -> str:
    """Nama bahasa untuk prompt; kode tak dikenal dipakai apa adanya."""
    if not code:
        return "the same language as the input"
    return _LANGUAGE_NAMES.get(code.split("-")[0].lower(), code)


def style_memory_instruction(memory: dict | None) -> str:
    """
    Ubah AI Memory user (preferensi gaya dari Pengaturan) jadi blok instruksi
    buat ditempel di prompt LLM. Balikin string kosong kalau memorinya kosong,
    jadi prompt persis sama kayak sebelum fitur ini ada.
    """
    if not memory:
        return ""

    lines: list[str] = []
    tone = memory.get("tone")
    if tone:
        lines.append(f"- Tone: {tone}")
    language = memory.get("language")
    if language:
        # memory.language disimpan sebagai label ("Bahasa Indonesia"), tapi
        # klien lama bisa saja ngirim kode - dua-duanya lewat language_name.
        lines.append(f"- Write in {language_name(language)}.")
    glossary = memory.get("glossary") or []
    if glossary:
        terms = ", ".join(str(term) for term in glossary)
        lines.append(f"- Never translate or alter these terms: {terms}")
    notes = memory.get("notes")
    if notes:
        lines.append(f"- Additional style notes: {notes}")

    if not lines:
        return ""
    return (
        "\n\nThe user saved these writing preferences. Apply them to every "
        "sentence you return:\n" + "\n".join(lines)
    )



def get_last_total_tokens() -> int | None:
    return _last_total_tokens


def _build_language_rule(language: str | None) -> str:
    """Perintah bahasa di depan prompt - lihat alasan di rewrite_sentences."""
    if not language:
        return ""
    name = language_name(language)
    return (
        f"CRITICAL: every sentence you return MUST be written in {name}. "
        f"The input is in {name}. Never translate it to English or any "
        f"other language, not even partially.\n\n"
    )


def _chat_json(system: str, user_payload: list[str], provider: Provider) -> object | None:
    """Satu call chat completions (json_object); balikin JSON ter-parse atau None."""
    global _last_total_tokens
    _last_total_tokens = None
    try:
        resp = requests.post(
            f"{provider.base_url.rstrip('/')}/chat/completions",
            headers={
                "Authorization": f"Bearer {provider.api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": provider.model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.7,
            },
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        body = resp.json()
        _last_total_tokens = (body.get("usage") or {}).get("total_tokens")
        return json.loads(body["choices"][0]["message"]["content"])
    except Exception as e:
        logger.warning("[llm_client] request LLM gagal: %s", e)
        return None


def rewrite_sentences(
    sentences: list[str],
    instruction: str,
    provider: Provider,
    language: str | None = None,
) -> list[str] | None:
    """
    Kirim semua kalimat dalam SATU request, balikin list kalimat hasil rewrite
    dengan jumlah elemen sama persis. None kalau gagal apapun sebabnya.
    """
    if not sentences:
        return []

    # Seluruh prompt ini berbahasa Inggris, dan model cenderung ikut bahasa
    # prompt-nya. Menitipkan "keep the original language" di dalam instruksi
    # saja terbukti kalah - naskah Indonesia balik jadi Inggris. Karena itu
    # bahasanya disebut namanya, sebagai perintah tersendiri di depan.
    system = (
        f"{_build_language_rule(language)}{instruction}\n\n"
        "You will receive a JSON array of sentences. Respond ONLY with a JSON "
        'object of the form {"sentences": [...]} containing exactly the same '
        "number of elements, where element i is the rewritten version of input "
        "sentence i. If a sentence needs no change, return it unchanged. Do not "
        "merge, split, add, or drop sentences."
    )

    parsed = _chat_json(system, sentences, provider)
    out = parsed.get("sentences") if isinstance(parsed, dict) else parsed

    if (
        not isinstance(out, list)
        or len(out) != len(sentences)
        or not all(isinstance(s, str) for s in out)
    ):
        logger.warning(
            "[llm_client] respons malformed (dapat %s elemen, butuh %s)",
            len(out) if isinstance(out, list) else "non-list",
            len(sentences),
        )
        return None

    return [s.strip() for s in out]


def rewrite_sentences_candidates(
    sentences: list[str],
    instruction: str,
    provider: Provider,
    language: str | None = None,
) -> list[list[str]] | None:
    """
    Kayak rewrite_sentences, tapi minta DUA alternatif rewrite per kalimat
    (buat fitur pilih-kandidat di AI Rewriter). Balikin list sejajar input,
    tiap elemen list kandidat 1-2 string; None kalau gagal apapun sebabnya.

    Format respons yang diminta (dokumentasikan juga di prompt):

        {"sentences": [{"candidates": ["varian A", "varian B"]}, ...]}

    Kandidat pertama = rewrite paling setia, kedua = varian gaya lain. Model
    yang bandel boleh balikin elemen string polos - dianggap satu kandidat.
    Kandidat yang kebetulan identik dideduplikasi, jadi panjang bisa 1.
    """
    if not sentences:
        return []

    system = (
        f"{_build_language_rule(language)}{instruction}\n\n"
        "You will receive a JSON array of sentences. For each sentence, "
        "produce TWO alternative rewrites that differ in style or wording but "
        "keep the same meaning. Respond ONLY with a JSON object of the form "
        '{"sentences": [{"candidates": ["...", "..."]}]} containing exactly '
        "the same number of elements, where element i holds the candidates "
        "for input sentence i. The first candidate should be the most "
        "faithful rewrite; the second may vary the phrasing more freely. "
        # Tanpa kalimat ini model membalas naskah yang sudah rapi apa adanya,
        # dan seluruh permintaan berakhir tanpa satu pun usulan. Menulis ulang
        # memang tugasnya - "sudah bagus" bukan jawaban yang berguna di sini.
        "Always rephrase: each candidate must differ in wording from the input "
        "sentence. Returning a sentence unchanged is not an acceptable answer; "
        "if a sentence already reads well, vary its structure or word choice "
        "while preserving the meaning. "
        "Do not merge, split, add, or drop sentences."
    )

    parsed = _chat_json(system, sentences, provider)
    # `_chat_json` sudah mencatat sebabnya saat requestnya sendiri yang gagal
    # (mis. 401). Membiarkannya jatuh ke cabang "malformed" di bawah membuat
    # log berbohong: yang terjadi bukan model membalas bentuk aneh, melainkan
    # tidak ada balasan sama sekali.
    if parsed is None:
        return None

    out = parsed.get("sentences") if isinstance(parsed, dict) else parsed

    if not isinstance(out, list) or len(out) != len(sentences):
        logger.warning(
            "[llm_client] respons kandidat malformed (dapat %s elemen, butuh %s)",
            len(out) if isinstance(out, list) else "non-list",
            len(sentences),
        )
        return None

    result: list[list[str]] = []
    for item in out:
        cands: list[str] = []
        if isinstance(item, str):
            cands = [item.strip()] if item.strip() else []
        elif isinstance(item, dict):
            raw = item.get("candidates")
            if isinstance(raw, list):
                cands = [c.strip() for c in raw if isinstance(c, str) and c.strip()][:2]
        if len(cands) == 2 and cands[0] == cands[1]:
            cands = cands[:1]
        if not cands:
            logger.warning("[llm_client] elemen respons bukan kandidat valid: %r", item)
            return None
        result.append(cands)

    return result


def translate_sentences(
    sentences: list[str],
    target_lang: str,
    provider: Provider,
    style_memory: dict | None = None,
) -> list[str] | None:
    """
    Terjemahkan semua kalimat dalam SATU request ke `target_lang`. Balikin list
    sepanjang input, atau None kalau gagal apa pun sebabnya.

    Sengaja TIDAK memakai `rewrite_sentences`: aturan bahasa di sana memerintah
    model mempertahankan bahasa asli ("keep the original language"), yang justru
    kebalikan dari yang dibutuhkan di sini. Menitipkan terjemahan lewat
    `instruction` saja akan beradu dengan perintah itu.

    `style_memory` tetap dihormati - terutama `glossary`, yang untuk terjemahan
    justru paling berguna: nama produk dan istilah teknis tidak ikut dialihkan.
    """
    if not sentences:
        return []

    target = language_name(target_lang)
    system = (
        f"Translate every sentence into {target}. Output must be written in "
        f"{target} and nothing else - never keep the source language, never "
        "add explanations or transliterations."
        + style_memory_instruction(style_memory)
        + "\n\nYou will receive a JSON array of sentences. Respond ONLY with a "
        'JSON object of the form {"sentences": [...]} containing exactly the '
        "same number of elements, where element i is the translation of input "
        "sentence i. Preserve numbers, inline formatting cues, and proper "
        "nouns. Do not merge, split, add, or drop sentences."
    )

    parsed = _chat_json(system, sentences, provider)
    if parsed is None:
        return None

    out = parsed.get("sentences") if isinstance(parsed, dict) else parsed
    if not isinstance(out, list) or len(out) != len(sentences):
        logger.warning(
            "[llm_client] respons terjemahan malformed (dapat %s elemen, butuh %s)",
            len(out) if isinstance(out, list) else "non-list",
            len(sentences),
        )
        return None

    result: list[str] = []
    for item, source in zip(out, sentences):
        if isinstance(item, str) and item.strip():
            result.append(item.strip())
        else:
            # Elemen yang tak terbaca dikembalikan sebagai kalimat aslinya:
            # di hilir itu berarti "tidak ada usulan" untuk kalimat itu saja,
            # bukan menggagalkan seluruh terjemahan.
            logger.warning("[llm_client] elemen terjemahan tidak valid: %r", item)
            result.append(source)

    return result


def define_terms(
    candidates: list[dict],
    provider: Provider,
    language: str | None = None,
    style_memory: dict | None = None,
) -> list[dict] | None:
    """
    Saring kandidat istilah dan tuliskan definisinya - satu request, masukan
    berupa DAFTAR KANDIDAT, bukan naskahnya.

    Itu yang membuat Glosarium sanggup memakan dokumen sepanjang apa pun:
    bagian yang membaca seluruh naskah dikerjakan tanpa LLM di analyzer, dan
    yang sampai ke sini hanya beberapa puluh istilah beserta satu kalimat
    konteks masing-masing.

    Balikin list {term, definition}; None kalau gagal apa pun sebabnya. Model
    boleh MEMBUANG kandidat yang ternyata bukan istilah - jumlah keluaran
    memang tidak harus sama dengan masukan, berbeda dari fungsi rewrite di atas.
    """
    if not candidates:
        return []

    system = (
        f"{_build_language_rule(language)}"
        "You are building a glossary (\"Daftar Istilah\") for an academic "
        "document. You will receive candidate terms, how often each appears, "
        "and one sentence of context.\n\n"
        "Keep ONLY entries that are genuine domain-specific terms, acronyms, "
        "or technical concepts a reader might not know. Drop ordinary words, "
        "person names, place names, section labels, and anything whose meaning "
        "is obvious. It is correct to return far fewer entries than you were "
        "given, and correct to return none.\n\n"
        "For each kept term write one concise definition (max 25 words) based "
        "on how it is used in the context provided.\n\n"
        "Also fill \"expansion\" when the term is an abbreviation: what the "
        "letters stand for, in its original language (e.g. DCS -> "
        "\"Distributed Control System\"). Take it from the context when the "
        "document spells it out. Otherwise supply it ONLY for widely "
        "established terms whose meaning is standard across the field. Leave "
        "\"expansion\" as an empty string for ordinary words, and for "
        "organisation- or project-specific abbreviations you cannot verify - "
        "an invented expansion in an academic document is worse than none."
        + style_memory_instruction(style_memory)
        + "\n\nRespond ONLY with a JSON object of the form "
        '{"entries": [{"term": "...", "expansion": "...", "definition": "..."}]}. '
        "Use each term "
        "exactly as it was given, without changing capitalization."
    )

    parsed = _chat_json(system, [json.dumps(candidates, ensure_ascii=False)], provider)
    if parsed is None:
        return None

    out = parsed.get("entries") if isinstance(parsed, dict) else parsed
    if not isinstance(out, list):
        logger.warning("[llm_client] respons glosarium malformed: bukan list")
        return None

    given = {item["term"] for item in candidates}
    entries: list[dict] = []
    for item in out:
        if not isinstance(item, dict):
            continue
        term = item.get("term")
        definition = item.get("definition")
        if not isinstance(term, str) or not isinstance(definition, str):
            continue
        term, definition = term.strip(), definition.strip()
        expansion = item.get("expansion")
        expansion = expansion.strip() if isinstance(expansion, str) else ""
        # Kepanjangan yang cuma mengulang istilahnya sendiri tidak berguna.
        if expansion.lower() == term.lower():
            expansion = ""
        # Istilah yang tidak pernah dikirim berarti model mengarang - dibuang,
        # supaya glosarium tidak memuat kata yang tak ada di naskah.
        if not term or not definition or term not in given:
            continue
        entries.append({"term": term, "expansion": expansion, "definition": definition})

    return entries
