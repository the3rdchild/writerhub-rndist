import logging

logger = logging.getLogger(__name__)

FMT_PDF = "pdf"
FMT_DOCX = "docx"
FMT_DOC = "doc"
FMT_TXT = "txt"

MIME_TXT = "text/plain"
MIME_PDF = "application/pdf"
MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
MIME_DOC = "application/msword"

_MIME_TO_FMT = {
    MIME_PDF: FMT_PDF,
    MIME_DOCX: FMT_DOCX,
    MIME_DOC: FMT_DOC,
    MIME_TXT: FMT_TXT,
}

_EXT_TO_FMT = {
    ".pdf": FMT_PDF,
    ".docx": FMT_DOCX,
    ".doc": FMT_DOC,
    ".txt": FMT_TXT,
}


_OLE2_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"


def sniff(data: bytes) -> str | None:
    if data.startswith(b"%PDF-"):
        return FMT_PDF
    if data.startswith(_OLE2_MAGIC):
        return FMT_DOC
    if data.startswith(b"PK\x03\x04") and b"word/" in data[:4096]:
        return FMT_DOCX
    return None


def from_mime(mime: str) -> str | None:
    base = (mime or "").split(";")[0].strip().lower()
    return _MIME_TO_FMT.get(base)


def from_hint(hint: str) -> str | None:
    lowered = (hint or "").lower()
    for ext, fmt in _EXT_TO_FMT.items():
        if lowered.endswith(ext):
            return fmt
    return None


def detect(data: bytes, mime: str = "", hint: str = "") -> str | None:
    sniffed = sniff(data)
    declared = from_mime(mime) or from_hint(hint)

    if sniffed and declared and sniffed != declared:
        logger.warning(
            "[extract.detect] isi file gak cocok sama yang diklaim | sniff=%s | declared=%s | hint=%s",
            sniffed,
            declared,
            hint,
        )
    return sniffed or declared
