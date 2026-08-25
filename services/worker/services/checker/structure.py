"""
Rule struktural (agreement be, number noun, modal/to + base, dll) via POS.
Pure-Python + spaCy. Fokus high-confidence + tense-neutral biar minim false-positive.

  manager were giving   → manager was giving      (noun + be agreement)
  the project are likely → the project is likely
  several task           → several tasks            (quantifier + number)
  one of my coworker     → one of my coworkers
  every documents        → every document
  to succeeds            → to succeed               (to/modal + base)
  couldn't continued     → couldn't continue
  each others            → each other
  many information       → much information
"""

import re

from .pos import tag


def _cap(sample: str, word: str) -> str:
    return word[:1].upper() + word[1:] if sample[:1].isupper() else word


def _iss(offset, length, replacement, type_, prio=0):
    return {"offset": offset, "length": length, "replacement": replacement,
            "type": type_, "category": "grammar", "prio": prio}
_IRREG_PLURAL = {"child": "children", "man": "men", "woman": "women",
                 "person": "people", "tooth": "teeth", "foot": "feet",
                 "mouse": "mice", "goose": "geese", "leaf": "leaves",
                 "life": "lives", "knife": "knives", "wife": "wives"}
_IRREG_SING = {v: k for k, v in _IRREG_PLURAL.items()}


def _pluralize(w):
    lw = w.lower()
    if lw in _IRREG_PLURAL:
        return _IRREG_PLURAL[lw]
    if lw.endswith(("s", "x", "z", "ch", "sh")):
        return lw + "es"
    if lw.endswith("y") and len(lw) > 1 and lw[-2] not in "aeiou":
        return lw[:-1] + "ies"
    return lw + "s"


def _depluralize(w):
    lw = w.lower()
    if lw in _IRREG_SING:
        return _IRREG_SING[lw]
    if lw.endswith("ies") and len(lw) > 4:
        return lw[:-3] + "y"
    if lw.endswith(("ches", "shes", "sses", "xes", "zzes")):
        return lw[:-2]
    if lw.endswith("s") and not lw.endswith("ss"):
        return lw[:-1]
    return None


_PAST_BASE = {
    "went": "go", "did": "do", "made": "make", "took": "take", "came": "come",
    "got": "get", "gave": "give", "saw": "see", "knew": "know", "ran": "run",
    "wrote": "write", "began": "begin", "spoke": "speak", "broke": "break",
    "chose": "choose", "drove": "drive", "ate": "eat", "fell": "fall",
    "felt": "feel", "found": "find", "left": "leave", "met": "meet",
    "paid": "pay", "said": "say", "sold": "sell", "sent": "send", "sat": "sit",
    "stood": "stand", "told": "tell", "thought": "think", "won": "win",
    "wore": "wear", "brought": "bring", "bought": "buy", "caught": "catch",
    "taught": "teach", "held": "hold", "kept": "keep", "lost": "lose",
    "built": "build", "spent": "spend", "heard": "hear", "drew": "draw",
    "grew": "grow", "threw": "throw", "flew": "fly", "blew": "blow",
    "shook": "shake", "gone": "go", "done": "do", "seen": "see", "taken": "take",
    "given": "give", "written": "write", "known": "know", "broken": "break",
    "continued": "continue", "started": "start", "finished": "finish",
    "worked": "work", "played": "play", "returned": "return", "stopped": "stop",
    "deleted": "delete", "expected": "expect", "needed": "need", "wanted": "want",
    "looked": "look", "talked": "talk", "walked": "walk", "called": "call",
    "asked": "ask", "helped": "help", "opened": "open", "closed": "close",
    "used": "use", "moved": "move", "lived": "live", "liked": "like",
    "watched": "watch", "studied": "study", "tried": "try", "stayed": "stay",
    "discussed": "discuss", "realized": "realize", "succeeded": "succeed",
    "happened": "happen", "changed": "change", "created": "create",
}


def _vbz_base(w):
    """3sg verb → base (succeeds→succeed, goes→go)."""
    lw = w.lower()
    irr = {"is": "be", "has": "have", "does": "do", "goes": "go"}
    if lw in irr:
        return irr[lw]
    if lw.endswith("ies") and len(lw) > 4:
        return lw[:-3] + "y"
    if lw.endswith(("ches", "shes", "sses", "xes", "zzes", "oes")):
        return lw[:-2]
    if lw.endswith("s") and not lw.endswith("ss"):
        return lw[:-1]
    return None


def _base_form(w, t):
    if t == "VBZ":
        return _vbz_base(w)
    if t in ("VBD", "VBN"):
        return _PAST_BASE.get(w.lower())
    return None


_UNCOUNTABLE = {
    "information", "advice", "knowledge", "equipment", "furniture", "money",
    "news", "research", "homework", "progress", "traffic", "software", "data",
    "feedback", "stuff", "music", "water", "time", "help", "luggage", "baggage",
    "work", "evidence", "weather", "patience", "vocabulary",
}

_SING_SUBJ = {"he", "she", "it", "this", "that", "nobody", "somebody", "anybody",
              "everybody", "everyone", "someone", "anyone", "nothing", "something",
              "each", "one", "either", "neither"}
_PLUR_SUBJ = {"we", "they", "these", "those"}
def _be_prep_governed(tagged, idx):
    """True kalau noun di idx didahului preposisi (object of prep, bukan subject).
    Contoh: 'one of my friends' → 'friends' di-govern 'of' → bukan subject."""
    j = idx - 1
    while j >= 0 and tagged[j][1] in ("DT", "JJ", "CD", "PRP$", "NN", "NNP"):
        j -= 1
    return j >= 0 and tagged[j][1] == "IN"


def _be_agreement(tagged, text):
    """noun/pronoun + is/are/was/were → samain number (swap be-form, no morfologi)."""
    out = []
    for i in range(1, len(tagged)):
        w, t, o, l = tagged[i]
        lw = w.lower()
        if lw not in ("is", "are", "was", "were"):
            continue
        k = i - 1
        while k >= 0 and tagged[k][1] == "RB":
            k -= 1
        if k < 0:
            continue
        sw, st = tagged[k][0], tagged[k][1]
        slw = sw.lower()
        if slw in ("there", "i", "you"):  # existential / subjunctive / ambigu
            continue
        if st in ("NN", "NNP", "NNS", "NNPS") and _be_prep_governed(tagged, k):
            continue
        is_sing = st in ("NN", "NNP") or slw in _SING_SUBJ
        is_plur = st in ("NNS", "NNPS") or slw in _PLUR_SUBJ
        fixed = None
        if is_sing and lw in ("are", "were"):
            fixed = {"are": "is", "were": "was"}[lw]
        elif is_plur and lw in ("is", "was"):
            fixed = {"is": "are", "was": "were"}[lw]
        if fixed:
            start = tagged[k][2]
            out.append(_iss(start, (o + l) - start, text[start:o] + _cap(w, fixed),
                            "Subject-verb agreement"))
    return out


def _noun_number(tagged, text):
    out = []
    n = len(tagged)
    PLURAL_DET = {"several", "few", "both", "various", "multiple", "numerous",
                  "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"}
    OF_HEAD = {"one", "each", "either", "neither"}
    for i in range(n - 1):
        lw = tagged[i][0].lower()
        if lw not in PLURAL_DET and lw not in ("every", "each", "many"):
            continue
        j = i + 1
        while j < n and tagged[j][1] in ("JJ", "JJR", "JJS"):
            j += 1
        if j >= n:
            continue
        nt = tagged[j]
        nlw = nt[0].lower()
        if lw in ("every", "each") and nt[1] in ("NNS", "NNPS"):
            sing = _depluralize(nt[0])
            if sing:
                out.append(_iss(nt[2], nt[3], _cap(nt[0], sing), "Noun number"))
        elif lw == "many" and nt[1] == "NN" and nlw in _UNCOUNTABLE:
            out.append(_iss(tagged[i][2], tagged[i][3], _cap(tagged[i][0], "much"), "Word choice"))
        elif lw in PLURAL_DET and nt[1] == "NN" and nlw not in _UNCOUNTABLE:
            out.append(_iss(nt[2], nt[3], _cap(nt[0], _pluralize(nt[0])), "Noun number"))
    for i in range(n - 2):
        if tagged[i][0].lower() in OF_HEAD and tagged[i + 1][0].lower() == "of":
            j = i + 2
            if j < n and tagged[j][1] in ("DT", "PRP$"):
                j += 1
            if j < n and tagged[j][1] == "NN" and tagged[j][0].lower() not in _UNCOUNTABLE:
                out.append(_iss(tagged[j][2], tagged[j][3],
                                _cap(tagged[j][0], _pluralize(tagged[j][0])), "Noun number"))
    return out


def _modal_to_base(tagged, text):
    """modal/to + verb non-base → base. ("to succeeds"→"succeed", "could went"→"go")"""
    out = []
    for i in range(1, len(tagged)):
        w, t, o, l = tagged[i]
        if t not in ("VBZ", "VBD", "VBN"):
            continue
        p = tagged[i - 1]
        pw = p[0].lower()
        after_modal = (
            p[1] == "MD"
            or pw == "to"
            or (pw in ("n't", "not") and i >= 2 and tagged[i - 2][1] == "MD")
        )
        if after_modal:
            base = _base_form(w, t)
            if base and base != w.lower():
                out.append(_iss(o, l, _cap(w, base), "Verb form"))
    return out


def _each_other(text):
    out = []
    for m in re.finditer(r"\beach\s+others\b", text, re.IGNORECASE):
        out.append(_iss(m.start(), len(m.group(0)), _cap(m.group(0), "each other"), "Word choice", prio=-1))
    return out


def check_structure(text: str) -> list[dict]:
    tagged = tag(text)
    out = []
    if tagged:
        for fn in (_be_agreement, _noun_number, _modal_to_base):
            try:
                out += fn(tagged, text)
            except Exception:
                pass
    try:
        out += _each_other(text)
    except Exception:
        pass
    return out
