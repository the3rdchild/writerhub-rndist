"""
AI grammar checker. Provider datang dari payload job. Returns same issue-dict
shape as rule-based checkers.
Fallback: caller gets empty list and falls through to standard mode.
"""

import json
import logging

import requests

logger = logging.getLogger(__name__)

_TIMEOUT = 90

_SYSTEM = (
    "You are a professional English grammar, spelling, and style checker.\n"
    "Analyze the given text and return every error you find.\n\n"
    "For each error produce a JSON object with these exact keys:\n"
    '  "original"    : the exact substring that is wrong (must exist verbatim in the text)\n'
    '  "replacement" : the corrected version of that substring\n'
    '  "type"        : short label, e.g. "Verb tense", "Subject-verb agreement", "Spelling", "Wordiness"\n'
    '  "category"    : one of "grammar" | "spelling" | "style"\n'
    '  "offset"      : 0-indexed character position where original starts in the text\n'
    '  "length"      : character length of original (must equal len(original))\n\n'
    "Respond ONLY with a JSON object: {\"suggestions\": [...]}.\n"
    "Be precise: offset must point exactly to the original substring in the text.\n"
    "If the text has no errors, return {\"suggestions\": []}."
)


def check_ai_grammar(
    text: str,
    *,
    model_id: str | None,
    alias: str | None,
    is_nine_router: bool,
    base_url: str,
    api_key: str,
    sdk_provider: str,
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
                    {"role": "system", "content": _SYSTEM},
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
    for s in suggestions:
        try:
            original    = str(s.get("original", ""))
            replacement = str(s.get("replacement", ""))
            offset      = int(s.get("offset", 0))
            length      = int(s.get("length", len(original)))
            category    = s.get("category", "grammar")
            if category not in ("grammar", "spelling", "style"):
                category = "grammar"
            if not original or original == replacement:
                continue
            out.append({
                "original":    original,
                "replacement": replacement,
                "type":        str(s.get("type", "Grammar error")),
                "category":    category,
                "offset":      offset,
                "length":      length,
                "prio":        0,
            })
        except Exception:
            continue

    return out, total_tokens
