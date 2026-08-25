"""
Rule-engine grammar (regex + heuristik, pure-Python).

Sengaja konservatif: cuma rule high-confidence biar minim false-positive.
Tinggal tambah entry di map/rule buat naikin coverage - extensible tanpa ubah kontrak.

Tiap rule balikin list dict: {offset, length, replacement, type, category:"grammar"}.
`original` di-slice belakangan di orchestrator.

Priority (prio) - kecil = menang saat overlap:
  -1 : compound fix (covers >1 error in one span, e.g. "dont knew" → "don't know")
   0 : core grammar rules
   1 : spelling (di file lain)
   2 : spacing / punctuation
   3 : capitalization (paling sering ngalah)
   4 : style (di file lain)
"""

import re


def _iss(offset: int, length: int, replacement: str, type_: str, prio: int = 0) -> dict:
    return {
        "offset": offset,
        "length": length,
        "replacement": replacement,
        "type": type_,
        "category": "grammar",
        "prio": prio,
    }
_CONFUSIONS = {
    "doesnt": "doesn't", "didnt": "didn't", "cant": "can't",
    "wont": "won't", "isnt": "isn't", "arent": "aren't", "wasnt": "wasn't",
    "werent": "weren't", "couldnt": "couldn't", "wouldnt": "wouldn't",
    "shouldnt": "shouldn't", "hasnt": "hasn't", "havent": "haven't",
    "hadnt": "hadn't", "wouldve": "would've", "couldve": "could've",
    "shouldve": "should've", "im": "I'm", "ive": "I've", "youre": "you're",
    "theyre": "they're", "hes": "he's", "shes": "she's", "thats": "that's",
    "whats": "what's", "alot": "a lot", "teh": "the", "wanna": "want to",
    "gonna": "going to", "gotta": "got to", "kinda": "kind of",
}
_PAST_TO_BASE = {
    "knew": "know", "went": "go", "saw": "see", "ate": "eat", "took": "take",
    "came": "come", "made": "make", "said": "say", "got": "get", "gave": "give",
    "found": "find", "thought": "think", "told": "tell", "became": "become",
    "left": "leave", "felt": "feel", "kept": "keep", "brought": "bring",
    "bought": "buy", "caught": "catch", "began": "begin", "ran": "run",
    "wrote": "write", "drove": "drive", "broke": "break", "spoke": "speak",
    "chose": "choose", "forgot": "forget", "sold": "sell", "sent": "send",
    "spent": "spend", "met": "meet", "paid": "pay", "heard": "hear",
    "held": "hold", "lost": "lose", "won": "win", "sat": "sit", "stood": "stand",
    "drank": "drink", "swam": "swim", "threw": "throw", "flew": "fly",
    "grew": "grow", "stayed": "stay", "decided": "decide", "arrived": "arrive",
    "walked": "walk", "looked": "look", "played": "play", "worked": "work",
    "started": "start", "stopped": "stop", "tried": "try", "used": "use",
    "liked": "like", "lived": "live", "moved": "move", "called": "call",
    "asked": "ask", "needed": "need", "wanted": "want", "happened": "happen",
    "seemed": "seem", "helped": "help", "showed": "show", "turned": "turn",
    "watched": "watch", "talked": "talk", "opened": "open", "closed": "close",
    "finished": "finish", "learned": "learn", "changed": "change",
    "followed": "follow", "created": "create",
}
_REGULARIZED_PAST = {
    "buyed": "bought", "gived": "gave", "taked": "took", "maked": "made",
    "goed": "went", "runned": "ran", "eated": "ate", "drinked": "drank",
    "sayed": "said", "telled": "told", "finded": "found", "writed": "wrote",
    "readed": "read", "speaked": "spoke", "breaked": "broke", "bringed": "brought",
    "catched": "caught", "holded": "held", "selled": "sold", "leaved": "left",
    "drived": "drove", "flied": "flew", "growed": "grew", "sended": "sent",
    "sitted": "sat", "standed": "stood", "swimmed": "swam", "throwed": "threw",
    "winned": "won", "losed": "lost", "puted": "put", "cutted": "cut",
    "hitted": "hit", "letted": "let", "shutted": "shut", "quited": "quit",
    "heared": "heard", "feeled": "felt", "keeped": "kept", "meeted": "met",
    "payed": "paid", "selled": "sold", "thinked": "thought",
}
_PLURAL_MASS = {
    "peoples": "people", "stuffs": "stuff", "childs": "children", "mans": "men",
    "womans": "women", "informations": "information", "advices": "advice",
    "knowledges": "knowledge", "softwares": "software", "equipments": "equipment",
    "furnitures": "furniture", "moneys": "money", "feedbacks": "feedback",
    "researches": "research", "homeworks": "homework", "luggages": "luggage",
    "baggages": "baggage", "musics": "music", "newses": "news",
}
_ING_TO_BASE = {
    "walking": "walk", "running": "run", "sitting": "sit", "standing": "stand",
    "working": "work", "talking": "talk", "going": "go", "doing": "do",
    "making": "make", "taking": "take", "getting": "get", "putting": "put",
    "coming": "come", "giving": "give", "looking": "look", "using": "use",
    "thinking": "think", "saying": "say", "knowing": "know", "seeing": "see",
    "playing": "play", "trying": "try", "starting": "start", "eating": "eat",
    "drinking": "drink", "writing": "write", "reading": "read", "sleeping": "sleep",
    "driving": "drive", "buying": "buy", "selling": "sell", "helping": "help",
    "calling": "call", "asking": "ask", "living": "live", "moving": "move",
    "feeling": "feel", "leaving": "leave", "bringing": "bring", "sending": "send",
    "waiting": "wait", "following": "follow", "showing": "show", "learning": "learn",
    "studying": "study", "winning": "win", "losing": "lose", "meeting": "meet",
    "deciding": "decide", "choosing": "choose", "cooking": "cook",
    "swimming": "swim", "flying": "fly", "teaching": "teach",
    "listening": "listen", "jumping": "jump", "stopping": "stop",
    "continuing": "continue", "returning": "return", "arriving": "arrive",
    "finishing": "finish", "starting": "start", "changing": "change",
    "opening": "open", "closing": "close", "building": "build",
    "spending": "spend", "finding": "find", "keeping": "keep",
}
_PHRASE_FIXES = [
    (r"\byour welcome\b", "you're welcome"),
    (r"\bfor all intensive purposes\b", "for all intents and purposes"),
    (r"\bone in the same\b", "one and the same"),
    (r"\bby in large\b", "by and large"),
    (r"\bcase and point\b", "case in point"),
    (r"\bnip it in the butt\b", "nip it in the bud"),
    (r"\bon accident\b", "by accident"),
    (r"\bcould care less\b", "couldn't care less"),
    (r"\bworse comes to worse\b", "worst comes to worst"),
    (r"\bmute point\b", "moot point"),
    (r"\bfree reign\b", "free rein"),
    (r"\bbeckon call\b", "beck and call"),
    (r"\bself of steam\b", "self-esteem"),
]
_NEG_WORDS = {
    "no": "any", "nothing": "anything", "nobody": "anybody",
    "nowhere": "anywhere", "none": "any", "neither": "either",
}
_NEG_AUX = r"(?:do|does|did|ca|wo|could|would|should|is|are|was|were|have|has|had|ai)"
_SILENT_H = ("hour", "honest", "honor", "honour", "heir")
_CONS_SOUND = ("uni", "use", "usu", "ufo", "one", "once", "euro", "ewe", "unit",
               "user", "usual", "u-")


def _vowel_sound(word: str) -> bool:
    w = word.lower()
    if any(w.startswith(p) for p in _SILENT_H):
        return True
    if any(w.startswith(p) for p in _CONS_SOUND):
        return False
    return w[:1] in "aeiou"


def _cap_like(sample: str, word: str) -> str:
    return word[:1].upper() + word[1:] if sample[:1].isupper() else word


def check_grammar(text: str) -> list[dict]:
    out: list[dict] = []
    for m in re.finditer(r"\b[A-Za-z]+\b", text):
        repl = _REGULARIZED_PAST.get(m.group(0).lower())
        if repl:
            out.append(_iss(m.start(), len(m.group(0)), _cap_like(m.group(0), repl), "Verb form (irregular)"))
    _NEG_APOS = {"dont": "don't", "doesnt": "doesn't", "didnt": "didn't"}
    for m in re.finditer(r"\b(did|does|do)(n['']?t)\s+([A-Za-z]+)\b", text, re.IGNORECASE):
        base = _PAST_TO_BASE.get(m.group(3).lower())
        if base:
            raw_neg = (m.group(1) + m.group(2)).lower()
            neg = _NEG_APOS.get(raw_neg, m.group(1) + m.group(2))
            if m.group(1)[0].isupper():
                neg = neg[:1].upper() + neg[1:]
            out.append(_iss(
                m.start(), len(m.group(0)),
                f"{neg} {base}",
                "Verb form", prio=-1,
            ))
    for m in re.finditer(r"\b[A-Za-z]+\b", text):
        repl = _CONFUSIONS.get(m.group(0).lower())
        if repl:
            out.append(_iss(m.start(), len(m.group(0)), _cap_like(m.group(0), repl), "Grammar"))
    for m in re.finditer(r"\b(he|she|it)(\s+)dont\b", text, re.IGNORECASE):
        out.append(_iss(m.start(), len(m.group(0)), f"{m.group(1)}{m.group(2)}doesn't", "Verb agreement", prio=-1))
    for m in re.finditer(r"\bdont\b", text, re.IGNORECASE):
        if re.search(r"(?:^|\W)(he|she|it)\s+$", text[:m.start()], re.IGNORECASE):
            continue  # udah ditangani rule he/she/it di atas
        out.append(_iss(m.start(), len(m.group(0)), _cap_like(m.group(0), "don't"), "Grammar", prio=-1))
    for m in re.finditer(r"\b(peoples?|men|women|children|they|we)\s+was\b", text, re.IGNORECASE):
        subj = m.group(1)
        fixed = "people" if subj.lower() == "peoples" else subj.lower()
        fixed = _cap_like(subj, fixed)
        out.append(_iss(m.start(), len(m.group(0)), f"{fixed} were", "Subject-verb agreement"))
    for m in re.finditer(r"\b(he|she|it)\s+were\b", text, re.IGNORECASE):
        out.append(_iss(m.start(), len(m.group(0)), f"{m.group(1)} was", "Subject-verb agreement"))
    for m in re.finditer(r"\b[A-Za-z]+\b", text):
        repl = _PLURAL_MASS.get(m.group(0).lower())
        if repl:
            out.append(_iss(m.start(), len(m.group(0)), _cap_like(m.group(0), repl), "Word form"))
    for m in re.finditer(r"\b(could|would|should|must|might)\s+of\b", text, re.IGNORECASE):
        out.append(_iss(m.start(), len(m.group(0)), f"{m.group(1)} have", "Verb phrase"))
    for pat, repl in _PHRASE_FIXES:
        for m in re.finditer(pat, text, re.IGNORECASE):
            out.append(_iss(m.start(), len(m.group(0)), _cap_like(m.group(0), repl), "Word choice"))
    _neg_re = rf"\b{_NEG_AUX}n['']?t\s+(?:\w+\s+){{0,2}}({'|'.join(_NEG_WORDS)})\b"
    for m in re.finditer(_neg_re, text, re.IGNORECASE):
        neg = m.group(1)
        out.append(_iss(m.start(1), len(neg), _cap_like(neg, _NEG_WORDS[neg.lower()]), "Double negative"))
    for m in re.finditer(r"\b(an?)(\s+)([A-Za-z]+)", text, re.IGNORECASE):
        art, ws, word = m.group(1), m.group(2), m.group(3)
        correct = "an" if _vowel_sound(word) else "a"
        if art.lower() != correct:
            correct = _cap_like(art, correct)
            out.append(_iss(m.start(), len(m.group(0)), f"{correct}{ws}{word}", "Article"))
    for m in re.finditer(r"\b(\w+)(\s+)(\1)\b", text, re.IGNORECASE):
        out.append(_iss(m.start(), len(m.group(0)), m.group(1), "Repeated word"))
    for m in re.finditer(r"\bto\s+([A-Za-z]+ing)\b", text):
        gerund = m.group(1).lower()
        base = _ING_TO_BASE.get(gerund)
        if base:
            out.append(_iss(m.start(), len(m.group(0)), f"to {base}", "Infinitive form"))
    for m in re.finditer(r"\b(i)(\s+)([A-Za-z]+)", text):
        out.append(_iss(m.start(), len(m.group(0)), f"I{m.group(2)}{m.group(3)}", "Capitalize 'I'", prio=3))
    for m in re.finditer(r"(?:^|[.!?]+\s+)([a-z][A-Za-z]*)", text, re.MULTILINE):
        word = m.group(1)
        out.append(_iss(m.start(1), len(word), word[:1].upper() + word[1:], "Capitalization", prio=3))
    for m in re.finditer(r"(\S)(\s+)([,.;:!?])", text):
        out.append(_iss(m.start(1), len(m.group(0)), m.group(1) + m.group(3), "Spacing", prio=2))
    for m in re.finditer(r"([!?,])\1+", text):
        out.append(_iss(m.start(), len(m.group(0)), m.group(1), "Punctuation", prio=2))

    return out
