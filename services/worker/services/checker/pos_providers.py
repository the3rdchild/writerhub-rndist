"""
POS provider - abstraksi sumber POS tag biar seragam.

Dua implementasi yang interchangeable:
  - SpacyPosProvider : spaCy en_core_web_sm (lokal, akurat, cepat). Provider utama.
  - AiPosProvider    : fallback pas spaCy ga aktif. Tokenisasi DILAKUKAN LOKAL
                       (offset char dijamin akurat), LLM cuma diminta ngasih
                       Penn Treebank tag per token (urutan & jumlah sama).

resolve_provider() milih provider pertama yang available (spaCy dulu, baru AI).
Kontrak tag() sama persis buat semua provider:
    list[(word, penn_tag, offset, length)]   ([] kalau gagal/ga ada)
"""

import json
import logging
import re

import requests

from core.configs.env import AI_API_KEY, AI_APP_TITLE, AI_BASE_URL, AI_MODEL, AI_REFERER

logger = logging.getLogger(__name__)

# token = rangkaian word-char ATAU satu tanda baca; whitespace di-skip.
# Niru tokenisasi spaCy (punctuation jadi token tersendiri) + offset char asli.
_TOKEN_RE = re.compile(r"\w+|[^\w\s]")

PosTags = list[tuple[str, str, int, int]]


class PosProvider:
    name: str = "base"

    def is_available(self) -> bool:
        raise NotImplementedError

    def tag(self, text: str) -> PosTags:
        raise NotImplementedError


class AiPosProvider(PosProvider):
    name = "ai"
    _TIMEOUT = 10 
    _MAX_TOKENS = 1500  # guard: teks kepanjangan → skip (offset rule ga kritikal di teks raksasa)

    def is_available(self) -> bool:
        return bool(AI_API_KEY)

    def _tokenize(self, text: str) -> list[tuple[str, int, int]]:
        return [(m.group(0), m.start(), len(m.group(0))) for m in _TOKEN_RE.finditer(text)]

    def tag(self, text: str) -> PosTags:
        if not self.is_available():
            return []
        tokens = self._tokenize(text)
        if not tokens or len(tokens) > self._MAX_TOKENS:
            if tokens:
                logger.warning("[pos] AI provider skip - token kebanyakan (%d)", len(tokens))
            return []

        words = [w for (w, _o, _l) in tokens]
        system = (
            "You are a part-of-speech tagger. You will receive a JSON array of tokens "
            "(words and punctuation) already split in order. Respond ONLY with a JSON "
            'object {"tags": [...]} containing EXACTLY one Penn Treebank POS tag per input '
            "token, in the same order and the same count. Use standard Penn tags "
            "(e.g. NN, NNS, NNP, PRP, VB, VBP, VBZ, VBD, VBG, JJ, RB, DT, IN, MD, TO, CC, "
            "and punctuation tags like '.', ',', ':'). Do not add, drop, merge, or reorder."
        )
        try:
            resp = requests.post(
                # AI_BASE_URL adalah base URL (mis. https://openrouter.ai/api/v1),
                # sama seperti yang dipakai llm_client.py dan ai_grammar.py serta
                # sama dengan `baseUrl` yang dikirim admin-ppe. Sebelumnya modul ini
                # memperlakukannya sebagai URL lengkap, sehingga satu nilai env tidak
                # mungkin benar untuk keduanya sekaligus.
                f"{AI_BASE_URL.rstrip('/')}/chat/completions",
                headers={
                    "Authorization": f"Bearer {AI_API_KEY}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": AI_REFERER,
                    "X-Title": AI_APP_TITLE,
                },
                json={
                    "model": AI_MODEL,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": json.dumps(words, ensure_ascii=False)},
                    ],
                    "response_format": {"type": "json_object"},
                    "temperature": 0,
                },
                timeout=self._TIMEOUT,
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
            parsed = json.loads(content)
            tags = parsed if isinstance(parsed, list) else parsed.get("tags")
        except Exception as e:
            logger.warning("[pos] AI provider request gagal: %s", e)
            return []

        if not isinstance(tags, list) or len(tags) != len(tokens) or not all(isinstance(t, str) for t in tags):
            logger.warning(
                "[pos] AI provider respons malformed (dapat %s, butuh %d)",
                len(tags) if isinstance(tags, list) else "non-list",
                len(tokens),
            )
            return []

        logger.info("[pos] provider=ai (%s) tagged %d token", AI_MODEL, len(tokens))
        return [(w, tags[i].strip(), off, ln) for i, (w, off, ln) in enumerate(tokens)]


_PROVIDERS: list[PosProvider] = [AiPosProvider()]
_resolved: PosProvider | None = None
_resolved_done = False


def resolve_provider() -> PosProvider | None:
    """Provider pertama yang available (cached). None kalau semua ga aktif."""
    global _resolved, _resolved_done
    if _resolved_done:
        return _resolved
    for p in _PROVIDERS:
        if p.is_available():
            _resolved = p
            logger.info("[pos] aktif provider=%s", p.name)
            break
    else:
        logger.warning("[pos] ga ada POS provider aktif - POS rules nonaktif")
    _resolved_done = True
    return _resolved
