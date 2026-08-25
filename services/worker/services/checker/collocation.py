"""
Kolokasi preposisi yang sering salah (kurated, high-confidence). Regex raw-text.
Cuma yang preposisi salahnya nyaris selalu keliru (biar minim false-positive).
"""

import re


def _cap(sample: str, word: str) -> str:
    return word[:1].upper() + word[1:] if sample[:1].isupper() else word


def _iss(offset, length, replacement, type_="Preposition", prio=0):
    return {
        "offset": offset,
        "length": length,
        "replacement": replacement,
        "type": type_,
        "category": "grammar",
        "prio": prio,
    }
_PAIRS = [
    (r"\bdepends\s+of\b", "depends on"),
    (r"\bdepend\s+of\b", "depend on"),
    (r"\bdepending\s+of\b", "depending on"),
    (r"\bdepended\s+of\b", "depended on"),
    (r"\bmarried\s+with\b", "married to"),
    (r"\bdiscuss\s+about\b", "discuss"),
    (r"\bdiscusses\s+about\b", "discusses"),
    (r"\bdiscussed\s+about\b", "discussed"),
    (r"\bdiscussing\s+about\b", "discussing"),
    (r"\bconsist\s+in\b", "consist of"),
    (r"\bconsists\s+in\b", "consists of"),
    (r"\bconsisting\s+in\b", "consisting of"),
    (r"\bcapable\s+to\b", "capable of"),
    (r"\bafraid\s+from\b", "afraid of"),
    (r"\binterested\s+for\b", "interested in"),
    (r"\bresponsible\s+of\b", "responsible for"),
    (r"\baccording\s+with\b", "according to"),
]


def check_collocation(text: str) -> list[dict]:
    out = []
    for pat, repl in _PAIRS:
        for m in re.finditer(pat, text, re.IGNORECASE):
            out.append(_iss(m.start(), len(m.group(0)), _cap(m.group(0), repl)))
    return out
