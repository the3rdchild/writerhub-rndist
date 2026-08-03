import json
import logging

import requests

from core.provider import Provider

logger = logging.getLogger(__name__)

_TIMEOUT = 60  # detik — satu batch request untuk semua kalimat

_last_total_tokens: int | None = None


def get_last_total_tokens() -> int | None:
    return _last_total_tokens


def rewrite_sentences(sentences: list[str], instruction: str, provider: Provider) -> list[str] | None:
    """
    Kirim semua kalimat dalam SATU request, balikin list kalimat hasil rewrite
    dengan jumlah elemen sama persis. None kalau gagal apapun sebabnya.
    """
    global _last_total_tokens
    _last_total_tokens = None
    if not sentences:
        return []

    system = (
        f"{instruction}\n\n"
        "You will receive a JSON array of sentences. Respond ONLY with a JSON "
        'object of the form {"sentences": [...]} containing exactly the same '
        "number of elements, where element i is the rewritten version of input "
        "sentence i. If a sentence needs no change, return it unchanged. Do not "
        "merge, split, add, or drop sentences."
    )

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
                    {"role": "user", "content": json.dumps(sentences, ensure_ascii=False)},
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.7,
            },
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        body = resp.json()
        _last_total_tokens = (body.get("usage") or {}).get("total_tokens")
        content = body["choices"][0]["message"]["content"]
        parsed = json.loads(content)
        out = parsed if isinstance(parsed, list) else parsed.get("sentences")
    except Exception as e:
        logger.warning("[llm_client] request LLM gagal: %s", e)
        return None

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
