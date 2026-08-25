"""
Style suggestions:
  1. curated wordiness/redundancy (reliable, ada replacement jelas)
  2. proselint (best-effort, cuma yang punya replacement actionable)

Semua category "style". `original` di-slice di orchestrator.
"""

import re
import logging

logger = logging.getLogger(__name__)
_PHRASES = [
    (r"\ba bit\b", "somewhat"),
    (r"\ba lot of\b", "many"),
    (r"\blots of\b", "many"),
    (r"\bin order to\b", "to"),
    (r"\bdue to the fact that\b", "because"),
    (r"\bat this point in time\b", "now"),
    (r"\bin the event that\b", "if"),
    (r"\bwith regard to\b", "regarding"),
    (r"\bin spite of\b", "despite"),
    (r"\beach and every\b", "every"),
    (r"\bfirst and foremost\b", "first"),
    (r"\bend result\b", "result"),
    (r"\bfinal outcome\b", "outcome"),
    (r"\bvery unique\b", "unique"),
    (r"\bfree gift\b", "gift"),
    (r"\bpast history\b", "history"),
    (r"\bbasically\b", ""),
    (r"\bactually\b", ""),
]


def _curated(text: str) -> list[dict]:
    out = []
    for pat, repl in _PHRASES:
        for m in re.finditer(pat, text, re.IGNORECASE):
            orig = m.group(0)
            r = repl
            if r and orig[:1].isupper():
                r = r[:1].upper() + r[1:]
            out.append(
                {
                    "offset": m.start(),
                    "length": len(orig),
                    "replacement": r,
                    "type": "Wordiness",
                    "category": "style",
                    "prio": 4,
                }
            )
    return out


def _proselint(text: str) -> list[dict]:
    out = []
    try:
        from proselint import tools

        for s in tools.lint(text):
            start = s[4]
            end = s[5]
            replacements = s[8] if len(s) > 8 else None
            if not replacements:
                continue  # cuma ambil yang actionable (ada usulan ganti)
            out.append(
                {
                    "offset": int(start),
                    "length": max(int(end) - int(start), 1),
                    "replacement": str(replacements),
                    "type": "Style suggestion",
                    "category": "style",
                    "prio": 4,
                }
            )
    except Exception as e:
        logger.debug("[style] proselint dilewatin: %s", e)
    return out


def check_style(text: str) -> list[dict]:
    return _curated(text) + _proselint(text)
