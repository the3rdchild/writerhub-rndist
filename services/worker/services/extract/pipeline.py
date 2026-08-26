from core.job_logger import JobLogger

from . import detect, normalize, parsers, sources
from .errors import EmptyTextError, ScannedPdfError, UnsupportedFormatError

_svc = JobLogger("extract")


def run(payload: dict) -> str:
    with _svc.timed_step("extract:source"):
        source = sources.resolve(payload)

    if source.text is not None:
        with _svc.timed_step("extract:normalize"):
            return normalize.normalize(source.text)

    with _svc.timed_step("extract:detect"):
        fmt = detect.detect(source.data, source.mime, source.hint)

    _svc.logger.info(
        "[extract] format=%s | origin=%s | bytes=%d | file=%s",
        fmt or "unknown",
        source.origin,
        len(source.data),
        source.hint or "-",
    )

    parser = parsers.get(fmt) if fmt else None
    if parser is None:
        _svc.logger.warning(
            "[extract] format ditolak | mime=%s | hint=%s", source.mime, source.hint
        )
        raise UnsupportedFormatError(
            f"Format file gak didukung{f' ({source.mime})' if source.mime else ''} - "
            f"pakai PDF, DOCX, atau TXT"
        )

    with _svc.timed_step(f"extract:parse:{fmt}"):
        text = parser(source.data)

    with _svc.timed_step("extract:normalize"):
        text = normalize.normalize(text)

    _assert_not_empty(text, fmt, source.hint)

    _svc.logger.info("[extract] beres | format=%s | chars=%d", fmt, len(text))
    return text


def _assert_not_empty(text: str, fmt: str, hint: str) -> None:
    if text.strip():
        return

    _svc.logger.warning("[extract] nol teks setelah parse | format=%s | file=%s", fmt, hint or "-")

    if fmt == detect.FMT_PDF:
        raise ScannedPdfError(
            "PDF ini gak punya teks yang bisa dibaca - kemungkinan hasil scan "
            "atau gambar. Coba PDF yang teksnya bisa diseleksi, atau salin "
            "teksnya manual."
        )
    raise EmptyTextError(f"Dokumen kosong, gak ada teks yang bisa diekstrak ({fmt})")
