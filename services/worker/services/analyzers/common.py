"""Util bersama untuk analyzer — sentence split dengan offset asli di teks."""

import re


def sentence_spans(text: str) -> list[tuple[str, int]]:
    """
    Split teks jadi kalimat, balikin list (kalimat, offset).
    Kalimat pendek (<4 kata) digabung ke kalimat sebelumnya biar
    model/heuristik dapet konteks cukup.
    """
    spans: list[tuple[str, int]] = []
    for m in re.finditer(r"[^.!?\n]+[.!?]*\s*", text):
        sent = m.group()
        if not sent.strip():
            continue
        if spans and len(sent.split()) < 4:
            prev_txt, prev_off = spans[-1]
            spans[-1] = (prev_txt + sent, prev_off)
        else:
            spans.append((sent, m.start()))
    return spans or ([(text, 0)] if text.strip() else [])


def words(text: str) -> list[str]:
    return re.findall(r"[A-Za-z']+", text.lower())


def apply_sentence_rewrites(
    text: str,
    spans: list[tuple[str, int]],
    rewritten_all: list[str],
) -> tuple[str, list[dict]]:
    """
    Susun ulang teks dari hasil rewrite per kalimat (jaga whitespace asli),
    plus list changes {original, replacement, offset, length} — satu per
    kalimat yang berubah, offset menunjuk kalimat stripped di teks ASLI.
    """
    parts: list[str] = []
    changes: list[dict] = []
    cursor = 0

    for (sent, offset), rewritten in zip(spans, rewritten_all):
        original = sent.strip()
        parts.append(text[cursor:offset])
        leading = sent[: len(sent) - len(sent.lstrip())]
        trailing = sent[len(sent.rstrip()):]
        parts.append(leading + rewritten + trailing)
        cursor = offset + len(sent)

        if rewritten != original:
            changes.append({
                "original": original,
                "replacement": rewritten,
                "offset": offset + len(leading),
                "length": len(original),
            })

    parts.append(text[cursor:])
    return "".join(parts), changes
