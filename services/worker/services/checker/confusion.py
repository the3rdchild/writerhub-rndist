"""
Confusion-set rules (kata yang sering ketuker) via konteks POS - ala Harper.
Pure-Python + spaCy, no LLM.

  your  + (verb-ing/modal/adverb/determiner) → you're   ("your going" / "your the best")
  its   + (verb-ing/modal/adverb/determiner) → it's     ("its raining" / "its a problem")
  there|their + verb-ing                     → they're  ("there going")
  <comparative> + then                        → than     ("smarter then me")

Konservatif: cuma trigger pas konteks POS jelas-jelas nunjukin bentuk kontraksi,
biar posesif yang bener (your book, its color) nggak ke-flag.
"""

from .pos import tag


def _cap(sample: str, word: str) -> str:
    return word[:1].upper() + word[1:] if sample[:1].isupper() else word


def _iss(offset, length, replacement, type_="Confused word", prio=0):
    return {
        "offset": offset,
        "length": length,
        "replacement": replacement,
        "type": type_,
        "category": "grammar",
        "prio": prio,
    }


# tag token setelah kata yang nandain "X is/are" (kontraksi), bukan posesif
_CONTRACTION_NEXT = {"VBG", "MD", "RB", "DT"}

# kata -ing yang setelah "its" nyaris selalu "it's ___ing" (spaCy sering salah tag NN)
_ITS_VERBS = {
    "raining", "snowing", "pouring", "freezing", "working", "happening",
    "coming", "going", "getting", "becoming", "growing", "improving",
    "increasing", "decreasing", "looking", "running", "melting", "burning",
    "leaking", "dripping", "blowing", "spinning", "starting", "spreading",
}


def _pair(text, first_w, fo, fl, nxt, repl):
    """Span = kata pertama + kata berikutnya (biar unik buat highlight)."""
    end = nxt[2] + nxt[3]
    replacement = _cap(first_w, repl) + text[fo + fl:end]
    return _iss(fo, end - fo, replacement)


def check_confusion(text: str) -> list[dict]:
    tagged = tag(text)
    if not tagged:
        return []

    out: list[dict] = []
    n = len(tagged)
    for i in range(n):
        w, t, o, l = tagged[i]
        lw = w.lower()
        nxt = tagged[i + 1] if i + 1 < n else None

        if lw == "your" and nxt and nxt[1] in _CONTRACTION_NEXT:
            out.append(_pair(text, w, o, l, nxt, "you're"))

        elif lw == "its" and nxt and (nxt[1] in _CONTRACTION_NEXT or nxt[0].lower() in _ITS_VERBS):
            out.append(_pair(text, w, o, l, nxt, "it's"))

        elif lw in ("there", "their") and nxt and nxt[1] == "VBG":
            out.append(_pair(text, w, o, l, nxt, "they're"))

        elif lw == "then" and i > 0:
            p = tagged[i - 1]
            pw = p[0].lower()
            is_comparative = (
                p[1] in ("JJR", "RBR")
                or pw in ("more", "less", "rather", "other")
                or (pw.endswith("er") and len(pw) > 3 and p[1] == "JJ")
            )
            if is_comparative:
                start = p[2]
                end = o + l
                out.append(_iss(start, end - start, text[start:o] + _cap(w, "than")))

    return out
