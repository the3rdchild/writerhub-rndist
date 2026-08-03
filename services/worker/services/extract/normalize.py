import logging
import re

logger = logging.getLogger(__name__)


_LIGATURES = {
    "ﬀ": "ff",
    "ﬁ": "fi",
    "ﬂ": "fl",
    "ﬃ": "ffi",
    "ﬄ": "ffl",
    "ﬅ": "st",
    "ﬆ": "st",
}


_INVISIBLE = re.compile(r"[​‌‍﻿­]")
_ODD_SPACES = re.compile(r"[  -   　]")
_LETTER = r"[^\W\d_]"
_HYPHEN_BREAK = re.compile(rf"({_LETTER})-\n({_LETTER})")
_TRAILING_WS = re.compile(r"[ \t]+$", re.MULTILINE)
_MULTI_SPACE = re.compile(r"[ \t]{2,}")
_MULTI_NEWLINE = re.compile(r"\n{3,}")


def _ligatures(text: str) -> str:
    for lig, plain in _LIGATURES.items():
        text = text.replace(lig, plain)
    return text


def normalize(text: str) -> str:
    if not text:
        return text

    before = len(text)

    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _ligatures(text)
    text = _INVISIBLE.sub("", text)
    text = _ODD_SPACES.sub(" ", text)
    text = _HYPHEN_BREAK.sub(r"\1\2", text)
    text = _TRAILING_WS.sub("", text)
    text = _MULTI_SPACE.sub(" ", text)
    text = _MULTI_NEWLINE.sub("\n\n", text)
    text = text.strip()

    logger.info(
        "[extract.normalize] chars %d → %d (selisih %+d)", before, len(text), len(text) - before
    )
    return text
