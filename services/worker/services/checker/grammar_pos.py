"""
Grammar rules berbasis POS tagging (nltk averaged-perceptron tagger).
Nangkep error yang butuh tau kelas kata — yang ga bisa di-cover regex murni.

Cakupan:
  1. Subject-verb agreement (pronoun & noun subject, present tense)
       "they sells" -> "they sell" | "the dogs runs" -> "the dogs run"
       "he go"      -> "he goes"   | "the cat eat"   -> "the cat eats"
  2. Adjective dipakai sebagai adverb setelah action verb
       "works good" -> "works well" | "runs quick" -> "runs quickly"
  3. Double comparative / superlative
       "more better" -> "better"    | "most fastest" -> "fastest"
  4. Determiner-noun number agreement
       "this dogs" -> "these dogs"  | "that cats" -> "those cats"

Konservatif: banyak guard biar minim false-positive (linking verb, prep-governed
noun, compound subject, attributive adjective). Butuh nltk; kalau ga ada → []
(otomatis nonaktif tanpa nge-crash).
"""

import logging

from .pos import tag

logger = logging.getLogger(__name__)

# ── subjects ────────────────────────────────────────────────────────────────
_PLURAL_SUBJ = {"i", "we", "you", "they", "these", "those"}
_SINGULAR_SUBJ = {"he", "she", "it", "this", "that"}
_NOUN_TAGS = {"NN", "NNP", "NNS", "NNPS"}
# tag/penanda yang kalau muncul SEBELUM subject → subject kemungkinan object
_OBJECT_SIGNAL = {"VB", "VBP", "VBZ", "VBD", "VBG", "TO", "MD"}

_VBZ_IRREGULAR = {"is": "are", "was": "were", "has": "have", "does": "do", "goes": "go"}
_VBP_IRREGULAR = {"are": "is", "were": "was", "have": "has", "do": "does", "go": "goes"}

# ── adjective → adverb (manner) ──────────────────────────────────────────────
_ADJ_TO_ADV = {
    "good": "well", "quick": "quickly", "slow": "slowly", "bad": "badly",
    "quiet": "quietly", "clear": "clearly", "easy": "easily", "real": "really",
    "careful": "carefully", "loud": "loudly", "soft": "softly", "perfect": "perfectly",
    "beautiful": "beautifully", "terrible": "terribly", "honest": "honestly",
    "serious": "seriously", "sudden": "suddenly", "complete": "completely",
    "proper": "properly", "happy": "happily", "angry": "angrily", "calm": "calmly",
    "brave": "bravely", "fluent": "fluently", "frequent": "frequently",
    "rare": "rarely", "smooth": "smoothly", "nice": "nicely", "safe": "safely",
    "cheap": "cheaply", "neat": "neatly", "fierce": "fiercely", "polite": "politely",
}
# verba kopula → diikuti adjective itu BENER ("looks good"), jangan dikoreksi
_LINKING_VERBS = {
    "be", "is", "are", "was", "were", "been", "being", "am",
    "look", "looks", "looked", "looking", "seem", "seems", "seemed",
    "feel", "feels", "felt", "feeling", "taste", "tastes", "tasted",
    "smell", "smells", "smelled", "sound", "sounds", "sounded",
    "appear", "appears", "appeared", "become", "becomes", "became",
    "get", "gets", "got", "stay", "stays", "stayed",
    "remain", "remains", "remained", "grow", "grows", "grew",
    "turn", "turns", "turned", "prove", "proves", "proved",
}

_THIS_THESE = {"this": "these", "that": "those"}


def _cap(sample: str, word: str) -> str:
    return word[:1].upper() + word[1:] if sample[:1].isupper() else word


def _to_plural_verb(w: str) -> str | None:
    lw = w.lower()
    if lw in _VBZ_IRREGULAR:
        return _cap(w, _VBZ_IRREGULAR[lw])
    if lw.endswith("ies") and len(lw) > 4:
        base = lw[:-3] + "y"
    elif lw.endswith(("ches", "shes", "sses", "xes", "zzes", "oes")):
        base = lw[:-2]
    elif lw.endswith("s") and not lw.endswith("ss"):
        base = lw[:-1]
    else:
        return None
    return _cap(w, base)


def _to_singular_verb(w: str) -> str:
    lw = w.lower()
    if lw in _VBP_IRREGULAR:
        return _cap(w, _VBP_IRREGULAR[lw])
    if lw.endswith(("ch", "sh", "ss", "x", "z", "o")):
        return _cap(w, lw + "es")
    if lw.endswith("y") and len(lw) > 1 and lw[-2] not in "aeiou":
        return _cap(w, lw[:-1] + "ies")
    return _cap(w, lw + "s")


def _iss(offset, length, replacement, type_, prio=0):
    return {
        "offset": offset,
        "length": length,
        "replacement": replacement,
        "type": type_,
        "category": "grammar",
        "prio": prio,
    }


def _find_subject(tagged, i):
    """Index subject ke belakang dari verb di i (skip adverb), maks 2 token."""
    for j in range(i - 1, max(i - 3, -1), -1):
        if tagged[j][1] == "RB":
            continue
        return j
    return None


def _prep_governed(tagged, idx):
    """True kalau noun di idx itu object of preposition (bukan subject klausa).
    Juga True kalau didahului quantifier 'one/each/none of' — noun di sini
    bukan head subject (head-nya adalah quantifier, bukan noun jamak).
    """
    j = idx - 1
    while j >= 0 and tagged[j][1] in ("DT", "JJ", "CD", "PRP$", "NN", "NNP"):
        j -= 1
    if j >= 0 and tagged[j][1] == "IN":
        # cek apakah token sebelum preposisi itu quantifier (one/each/none/etc.)
        # "one of my friends" → friends di-govern "of" setelah quantifier → prep-governed
        return True
    return False


def _np_start(tagged, idx):
    """Mundur ke awal noun phrase (lewatin DT/JJ/CD/PRP$) buat span highlight."""
    j = idx
    while j - 1 >= 0 and tagged[j - 1][1] in ("DT", "JJ", "CD", "PRP$"):
        j -= 1
    return j


# ── rule 1: subject-verb agreement ───────────────────────────────────────────
def _agreement(tagged, text):
    out = []
    for i, (w, t, o, l) in enumerate(tagged):
        if t not in ("VBZ", "VBP", "VB"):
            continue
        si = _find_subject(tagged, i)
        if si is None:
            continue

        sw, st = tagged[si][0], tagged[si][1]
        slw = sw.lower()

        # object guard: token sebelum subject = verb/TO/MD → subject kemungkinan object
        if si > 0 and tagged[si - 1][1] in _OBJECT_SIGNAL:
            continue
        # compound subject guard: "X and he/the cat ..." → skip (jamak)
        if si > 0 and tagged[si - 1][1] == "CC":
            continue

        fixed = None
        span_start_idx = si

        if slw in _PLURAL_SUBJ:
            if t == "VBZ":
                fixed = _to_plural_verb(w)
        elif slw in _SINGULAR_SUBJ:
            if t in ("VBP", "VB"):
                fixed = _to_singular_verb(w)
        elif st in _NOUN_TAGS:
            if _prep_governed(tagged, si):
                continue
            span_start_idx = _np_start(tagged, si)
            if st in ("NNS", "NNPS"):  # plural noun
                if t == "VBZ":
                    fixed = _to_plural_verb(w)
            else:  # singular noun
                if t in ("VBP", "VB"):
                    fixed = _to_singular_verb(w)

        if not fixed or fixed == w:
            continue

        start = tagged[span_start_idx][2]
        end = o + l
        out.append(_iss(start, end - start, text[start:o] + fixed, "Subject-verb agreement"))
    return out


# ── rule 2: adjective dipakai sebagai adverb ─────────────────────────────────
def _adverb_form(tagged, text):
    out = []
    for i in range(len(tagged) - 1):
        w, t, o, l = tagged[i]
        w2, t2, o2, l2 = tagged[i + 1]
        if t not in ("VBZ", "VBP", "VBD", "VB"):
            continue
        if w.lower() in _LINKING_VERBS:
            continue
        if t2 != "JJ":
            continue
        adv = _ADJ_TO_ADV.get(w2.lower())
        if not adv:
            continue
        # guard: adjective diikuti noun → atributif (modifying noun), bukan adverb
        if i + 2 < len(tagged) and tagged[i + 2][1] in ("NN", "NNS", "NNP", "NNPS"):
            continue
        out.append(_iss(o, (o2 + l2) - o, text[o:o2] + _cap(w2, adv), "Adverb form"))
    return out


# ── rule 3: double comparative / superlative ─────────────────────────────────
def _double_comparison(tagged, text):
    out = []
    for i in range(len(tagged) - 1):
        w, t, o, l = tagged[i]
        w2, t2, o2, l2 = tagged[i + 1]
        lw = w.lower()
        if lw == "more" and t2 in ("JJR", "RBR"):
            # "much/far/even/still more better" → span include intensifier di depan
            # supaya jadi satu fix: "much more better" → "much better"
            if i > 0 and tagged[i - 1][0].lower() in ("much", "far", "even", "still"):
                prev_o, prev_l = tagged[i - 1][2], tagged[i - 1][3]
                out.append(_iss(prev_o, (o2 + l2) - prev_o,
                                text[prev_o:o] + _cap(w, w2), "Double comparative"))
            else:
                out.append(_iss(o, (o2 + l2) - o, _cap(w, w2), "Double comparative"))
        elif lw == "most" and t2 in ("JJS", "RBS"):
            out.append(_iss(o, (o2 + l2) - o, _cap(w, w2), "Double superlative"))
    return out


# ── rule 4: determiner-noun number agreement ─────────────────────────────────
def _determiner_number(tagged, text):
    out = []
    for i in range(len(tagged) - 1):
        w, t, o, l = tagged[i]
        w2, t2, o2, l2 = tagged[i + 1]
        lw = w.lower()
        if lw in _THIS_THESE and t2 in ("NNS", "NNPS"):
            fixed = _cap(w, _THIS_THESE[lw])
            out.append(_iss(o, (o2 + l2) - o, fixed + text[o + l:o2 + l2], "Determiner agreement"))
    return out


def check_grammar_pos(text: str) -> list[dict]:
    tagged = tag(text)
    if not tagged:
        return []
    out = []
    for fn in (_agreement, _adverb_form, _double_comparison, _determiner_number):
        try:
            out += fn(tagged, text)
        except Exception:
            logger.exception("[grammar_pos] %s gagal", fn.__name__)
    return out
