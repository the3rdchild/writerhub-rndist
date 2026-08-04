"""
Registry parser: format → `parse(data: bytes) -> str`.

Nambah format = bikin modul dengan `parse()`, daftarin di `_REGISTRY`.

`.doc` gak didukung - udah ditolak whitelist mime di API. `detect.py` tetep
ngenalinnya lewat magic bytes OLE2 biar .doc yang di-rename jadi .pdf ketolak
dengan pesan akurat, bukan kebaca jadi teks sampah.
"""

from ..detect import FMT_DOCX, FMT_PDF, FMT_TXT
from . import docx, pdf, txt

_REGISTRY = {
    FMT_PDF: pdf.parse,
    FMT_DOCX: docx.parse,
    FMT_TXT: txt.parse,
}


def get(fmt: str):
    """Parser buat `fmt`, atau None kalau gak kedaftar."""
    return _REGISTRY.get(fmt)


def supported() -> list[str]:
    return sorted(_REGISTRY)
