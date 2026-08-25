"""
Rule grammar tingkat lanjut berbasis POS (spaCy). Pure-Python, no LLM.

  1. Perfect tense   : have/has/had + irregular past → past participle
                       "have went" → "have gone"
  2. Existential     : there + is/was + ... + plural noun → are/were
                       "there is many problems" → "there are many problems"
  3. Quantifier      : each|one|either|neither (+ of ...) + plural verb → singular
                       "each of the students have" → "has"
  4. Missing article : be + (adj) + count-noun tanpa determiner → sisip a/an
                       "I am student" → "I am a student"
  5. Past tense      : penanda waktu lampau + verb present → past
                       "Yesterday I go" → "Yesterday I went"
"""

import re

from .pos import tag


def _cap(sample: str, word: str) -> str:
    return word[:1].upper() + word[1:] if sample[:1].isupper() else word


def _iss(offset, length, replacement, type_, prio=0):
    return {
        "offset": offset,
        "length": length,
        "replacement": replacement,
        "type": type_,
        "category": "grammar",
        "prio": prio,
    }
_VBD_TO_VBN = {
    "went": "gone", "took": "taken", "ate": "eaten", "saw": "seen", "did": "done",
    "came": "come", "ran": "run", "gave": "given", "knew": "known", "grew": "grown",
    "threw": "thrown", "flew": "flown", "drew": "drawn", "wrote": "written",
    "drove": "driven", "rode": "ridden", "broke": "broken", "spoke": "spoken",
    "chose": "chosen", "froze": "frozen", "stole": "stolen", "woke": "woken",
    "began": "begun", "drank": "drunk", "sang": "sung", "rang": "rung",
    "swam": "swum", "sank": "sunk", "fell": "fallen", "forgot": "forgotten",
    "hid": "hidden", "bit": "bitten", "beat": "beaten", "tore": "torn",
    "wore": "worn", "swore": "sworn", "blew": "blown", "shook": "shaken",
    "mistook": "mistaken", "shrank": "shrunk", "rose": "risen", "spoke": "spoken",
    "hung": "hung",
}

_PRESENT_TO_PAST = {
    "go": "went", "goes": "went", "do": "did", "does": "did", "see": "saw",
    "sees": "saw", "come": "came", "comes": "came", "take": "took", "takes": "took",
    "get": "got", "gets": "got", "make": "made", "makes": "made", "eat": "ate",
    "eats": "ate", "give": "gave", "gives": "gave", "know": "knew", "knows": "knew",
    "run": "ran", "runs": "ran", "write": "wrote", "writes": "wrote", "buy": "bought",
    "buys": "bought", "bring": "brought", "think": "thought", "thinks": "thought",
    "tell": "told", "tells": "told", "feel": "felt", "feels": "felt", "find": "found",
    "finds": "found", "leave": "left", "leaves": "left", "meet": "met", "meets": "met",
    "pay": "paid", "pays": "paid", "say": "said", "says": "said", "sell": "sold",
    "send": "sent", "sit": "sat", "stand": "stood", "win": "won", "wear": "wore",
    "walk": "walked", "walks": "walked", "play": "played", "plays": "played",
    "work": "worked", "works": "worked", "want": "wanted", "wants": "wanted",
    "watch": "watched", "talk": "talked", "talks": "talked", "look": "looked",
    "looks": "looked", "call": "called", "ask": "asked", "help": "helped",
    "open": "opened", "close": "closed", "start": "started", "stay": "stayed",
    "live": "lived", "move": "moved", "use": "used", "like": "liked",
    "study": "studied", "studies": "studied", "try": "tried", "tries": "tried",
    "begin": "began", "begins": "began",
    "spend": "spent", "spends": "spent",
    "send": "sent", "sends": "sent",
    "crash": "crashed", "crashes": "crashed",
    "build": "built", "builds": "built",
    "catch": "caught", "catches": "caught",
    "choose": "chose", "chooses": "chose",
    "fall": "fell", "falls": "fell",
    "fight": "fought", "fights": "fought",
    "grow": "grew", "grows": "grew",
    "lead": "led", "leads": "led",
    "mean": "meant", "means": "meant",
    "sleep": "slept", "sleeps": "slept",
    "understand": "understood", "understands": "understood",
    "wake": "woke", "wakes": "woke",
    "forget": "forgot", "forgets": "forgot",
    "forgive": "forgave", "forgives": "forgave",
    "freeze": "froze", "freezes": "froze",
    "hide": "hid", "hides": "hid",
    "hold": "held", "holds": "held",
    "keep": "kept", "keeps": "kept",
    "lose": "lost", "loses": "lost",
    "show": "showed", "shows": "showed",
    "teach": "taught", "teaches": "taught",
    "hear": "heard", "hears": "heard",
    "read": "read", "reads": "read",
    "cut": "cut", "cuts": "cut",
    "hit": "hit", "hits": "hit",
    "let": "let", "lets": "let",
    "put": "put", "puts": "put",
    "set": "set", "sets": "set",
    "shut": "shut", "shuts": "shut",
    "hurt": "hurt", "hurts": "hurt",
}

_BE_TO_PLURAL = {"is": "are", "was": "were"}
_VBP_IRREGULAR = {"are": "is", "have": "has", "do": "does", "go": "goes"}

_MASS_NOUNS = {
    "water", "air", "money", "information", "music", "advice", "news", "work",
    "homework", "research", "knowledge", "furniture", "luggage", "rice", "bread",
    "time", "fun", "help", "love", "peace", "progress", "traffic", "weather",
    "food", "coffee", "tea", "sugar", "salt", "milk", "oil", "wood", "paper",
    "equipment", "software", "hardware", "data", "stuff", "feedback", "content",
    "home", "school", "work", "college", "church", "bed", "town", "english",
    "math", "science", "history", "art", "happiness", "sadness", "health",
}

_SILENT_H = ("hour", "honest", "honor", "honour", "heir")
_CONS_SOUND = ("uni", "use", "usu", "ufo", "one", "once", "euro", "ewe", "unit", "user", "usual")


def _vowel_sound(word: str) -> bool:
    w = word.lower()
    if any(w.startswith(p) for p in _SILENT_H):
        return True
    if any(w.startswith(p) for p in _CONS_SOUND):
        return False
    return w[:1] in "aeiou"


def _to_3sg(w: str) -> str:
    lw = w.lower()
    if lw in _VBP_IRREGULAR:
        return _cap(w, _VBP_IRREGULAR[lw])
    if lw.endswith(("ch", "sh", "ss", "x", "z", "o")):
        return _cap(w, lw + "es")
    if lw.endswith("y") and len(lw) > 1 and lw[-2] not in "aeiou":
        return _cap(w, lw[:-1] + "ies")
    return _cap(w, lw + "s")
def _perfect_tense(tagged, text):
    out = []
    n = len(tagged)
    for i in range(n - 1):
        w, t, o, l = tagged[i]
        if w.lower() not in ("have", "has", "had"):
            continue
        j = i + 1
        while j < n and tagged[j][1] == "RB":  # skip "already", "just", "never", "ever"
            j += 1
        if j >= n:
            continue
        vbn = _VBD_TO_VBN.get(tagged[j][0].lower())
        if vbn:
            start = o
            vo, vl = tagged[j][2], tagged[j][3]
            out.append(_iss(start, (vo + vl) - start, text[start:vo] + _cap(tagged[j][0], vbn), "Verb form"))
    return out


def _existential_there(tagged, text):
    out = []
    n = len(tagged)
    for i in range(n):
        if tagged[i][0].lower() != "there":
            continue
        if i + 1 >= n:
            continue
        be = tagged[i + 1]
        bw = be[0].lower()
        if bw not in ("is", "was"):
            continue
        j = i + 2
        while j < n and tagged[j][1] in ("JJ", "DT", "CD", "RB", "JJR", "JJS", "PRP$"):
            j += 1
        if j < n and tagged[j][1] in ("NNS", "NNPS"):  # noun jamak → be harus jamak
            fixed = _BE_TO_PLURAL[bw]
            start = tagged[i][2]
            end = be[2] + be[3]
            out.append(_iss(start, end - start, text[start:be[2]] + _cap(be[0], fixed),
                            "Subject-verb agreement"))
    return out


def _quantifier(tagged, text):
    out = []
    n = len(tagged)
    QUANT = {"each", "either", "neither", "every"}  # "one" dipisah krn sering = angka
    for i in range(n):
        if tagged[i][0].lower() not in QUANT:
            continue
        j = i + 1
        steps = 0
        while j < n and steps < 6:
            tg = tagged[j][1]
            wj = tagged[j][0].lower()
            if tg == "CC" or wj in ("and", "or"):
                break  # subjek majemuk → batal
            if tg == "VBP":
                fixed = _to_3sg(tagged[j][0])
                if fixed != tagged[j][0]:
                    out.append(_iss(tagged[j][2], tagged[j][3], fixed, "Subject-verb agreement"))
                break
            if tg in ("VBZ", "VBD", "MD"):
                break
            j += 1
            steps += 1
    return out


def _missing_article(tagged, text):
    out = []
    n = len(tagged)
    BE_SING = {"am", "is", "was", "be"}
    for i in range(n - 1):
        if tagged[i][0].lower() not in BE_SING:
            continue
        j = i + 1
        if j < n and tagged[j][1] == "RB":
            j += 1
        if j >= n:
            continue
        nt = tagged[j]
        if nt[1] != "NN":  # cuma noun tunggal common
            continue
        if nt[0].lower() in _MASS_NOUNS:
            continue
        if j - 1 >= 0 and tagged[j - 1][1] in ("DT", "PRP$", "CD"):
            continue
        art = "an" if _vowel_sound(nt[0]) else "a"
        out.append(_iss(nt[2], nt[3], f"{art} {nt[0]}", "Missing article", prio=1))
    return out


def _past_tense_marker(text):
    out = []
    pat = r"\b(yesterday|last\s+\w+|\d+\s+\w+\s+ago|earlier\s+today)\b,?\s+(I|we|you|they|he|she|it)\s+([a-z]+)\b"
    for m in re.finditer(pat, text, re.IGNORECASE):
        verb = m.group(3)
        past = _PRESENT_TO_PAST.get(verb.lower())
        if past:
            out.append(_iss(m.start(3), len(verb), _cap(verb, past), "Verb tense", prio=-1))
    return out
_NARRATIVE_SKIP = {
    "is", "are", "am", "be", "been", "being",
    "have", "has", "do", "does", "did", "will", "would", "can", "could",
    "may", "might", "shall", "should", "must", "need", "dare",
    "don't", "doesn't", "won't", "can't",
}
_PAST_SIGNAL_RE = re.compile(
    r"\b(yesterday|last\s+\w+|\d+\s+(?:days?|weeks?|months?|years?)\s+ago"
    r"|earlier|previously|once|at\s+that\s+time|that\s+day|that\s+night"
    r"|that\s+morning|that\s+afternoon|that\s+evening|the\s+next\s+day"
    r"|back\s+then|at\s+the\s+time)\b",
    re.IGNORECASE,
)

_VBZ_IREG_BASE = {"is": "be", "has": "have", "does": "do", "goes": "go"}


def _desinflect(w: str, tag: str) -> str:
    """VBZ (3sg present) → base form, biar lookup di _PRESENT_TO_PAST bisa kena."""
    lw = w.lower()
    if tag != "VBZ":
        return lw
    if lw in _VBZ_IREG_BASE:
        return _VBZ_IREG_BASE[lw]
    if lw.endswith("ies") and len(lw) > 4:
        return lw[:-3] + "y"
    if lw.endswith(("ches", "shes", "sses", "xes", "oes")):
        return lw[:-2]
    if lw.endswith("s") and not lw.endswith("ss"):
        return lw[:-1]
    return lw


def _to_past_form(w: str, tag: str) -> str:
    """Convert present verb (VBP/VBZ) ke past tense yang benar."""
    base = _desinflect(w, tag)
    past = _PRESENT_TO_PAST.get(base)
    if past:
        return past
    if base.endswith("e"):
        return base + "d"
    if base.endswith("y") and len(base) > 1 and base[-2] not in "aeiou":
        return base[:-1] + "ied"
    import re as _re
    is_monosyllabic = len(_re.findall(r"[aeiou]+", base)) == 1
    if (is_monosyllabic and len(base) >= 3 and base[-1] not in "aeiouywh"
            and base[-2] in "aeiou" and base[-3] not in "aeiou"):
        return base + base[-1] + "ed"
    return base + "ed"


def _narrative_tense(tagged, text):
    """
    Kalau teks narasi lampau (ada signal waktu lampau + minimal 3 VBD/VBN),
    flag verb present (VBP/VBZ) yang harusnya past tense.
    """
    if not _PAST_SIGNAL_RE.search(text):
        return []
    past_count = sum(1 for _, t, _, _ in tagged if t in ("VBD", "VBN"))
    if past_count < 3:
        return []

    out = []
    for i, (w, t, o, l) in enumerate(tagged):
        if t == "VB":
            if i == 0:
                continue
            prev_t = tagged[i - 1][1]
            prev_w = tagged[i - 1][0].lower()
            if prev_t in ("MD", "TO") or prev_w in ("to", "n't", "not"):
                continue
            finite = prev_w in ("and", "or", "but") or prev_t in (
                "NN", "NNS", "NNP", "NNPS", "PRP", "DT"
            )
            if not finite:
                continue
        elif t not in ("VBP", "VBZ"):
            continue
        if w.lower() in _NARRATIVE_SKIP:
            continue
        before = text[max(0, o - 12):o].lower()
        if re.search(r"\b(do|does)n'?t\s+$", before):
            continue
        past = _to_past_form(w, t)
        if past == w.lower():
            continue
        out.append(_iss(o, l, _cap(w, past), "Verb tense (narrative)", prio=-1))
    return out


def _was_base_verb(tagged, text):
    """
    Tangkap pola 'was/were + base-verb' yang seharusnya simple past.
    Contoh: "I was enjoy it" → "I enjoyed it"
            "they were go there" → "they went there"
    Hanya VB (base) setelah was/were copula - BUKAN VBG (gerund/progressive sudah benar).
    """
    out = []
    n = len(tagged)
    for i in range(1, n):
        w, t, o, l = tagged[i]
        if t != "VB":
            continue
        if w.lower() in _NARRATIVE_SKIP:
            continue
        prev_w = tagged[i - 1][0].lower()
        prev_t = tagged[i - 1][1]
        if prev_w not in ("was", "were") or prev_t != "VBD":
            continue
        past = _to_past_form(w, "VBP")
        if past == w.lower():
            continue
        prev_o, prev_l = tagged[i - 1][2], tagged[i - 1][3]
        span_start = prev_o
        repl = _cap(tagged[i - 1][0], past)
        out.append(_iss(span_start, (o + l) - span_start, repl, "Verb tense", prio=-1))
    return out
def _narrative_negation(text):
    out = []
    for m in re.finditer(
        r"\b(don't|doesn't)\s+([a-z]+)\b", text, re.IGNORECASE
    ):
        neg = m.group(1).lower()
        if neg in ("don't", "doesn't"):
            full = m.group(0)
            repl = "didn't " + m.group(2)
            out.append({
                "offset": m.start(),
                "length": len(full),
                "replacement": _cap(full, repl),
                "type": "Verb tense (narrative)",
                "category": "grammar",
                "prio": 1,  # lebih rendah dari rule lain, tapi kasih chance
            })
    return out


def check_advanced(text: str) -> list[dict]:
    tagged = tag(text)
    out = []
    if tagged:
        for fn in (_perfect_tense, _existential_there, _quantifier,
                   _missing_article, _narrative_tense, _was_base_verb):
            try:
                out += fn(tagged, text)
            except Exception:
                pass
    for fn in (_past_tense_marker,):
        try:
            out += fn(text)
        except Exception:
            pass
    if _PAST_SIGNAL_RE.search(text):
        try:
            out += _narrative_negation(text)
        except Exception:
            pass
    return out
