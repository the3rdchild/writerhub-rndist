import logging

logger = logging.getLogger(__name__)

_ENCODINGS = ("utf-8", "latin-1")


def parse(data: bytes) -> str:
    for enc in _ENCODINGS:
        try:
            text = data.decode(enc)
            logger.info("[extract.parse:txt] encoding=%s | chars=%d", enc, len(text))
            return text
        except UnicodeDecodeError:
            continue

    logger.warning("[extract.parse:txt] gak ada encoding yang cocok, pakai replace")
    return data.decode("utf-8", errors="replace")
