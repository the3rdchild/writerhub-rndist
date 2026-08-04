"""
Text extraction pipeline (pdf/docx/txt).

Fasad tipis - `resolve_text(payload)` satu-satunya pintu keluar buat
`grammar_service` dan `analysis_service`.
"""

from .errors import (
    CorruptFileError,
    EmptyTextError,
    ExtractionError,
    NoSourceError,
    ScannedPdfError,
    SourceFetchError,
    UnsupportedFormatError,
)
from .pipeline import run as resolve_text

__all__ = [
    "resolve_text",
    "ExtractionError",
    "NoSourceError",
    "UnsupportedFormatError",
    "CorruptFileError",
    "EmptyTextError",
    "ScannedPdfError",
    "SourceFetchError",
]
