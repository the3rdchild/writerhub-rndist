
import base64
import logging
from dataclasses import dataclass

import requests

from core.configs.env import EXTRACT_MAX_FILE_BYTES, EXTRACT_VERIFY_SSL

from .errors import NoSourceError, SourceFetchError

logger = logging.getLogger(__name__)

DOWNLOAD_TIMEOUT = 30
_CHUNK_SIZE = 64 * 1024


@dataclass(frozen=True)
class Source:
    """Hasil tahap 1. `text` keisi = shortcut, `data` bakal None."""

    text: str | None = None
    data: bytes | None = None
    mime: str = ""
    hint: str = ""
    origin: str = ""


def resolve(payload: dict) -> Source:
    text = payload.get("text")
    if text and text.strip():
        logger.info("[extract.source] teks langsung | chars=%d", len(text))
        return Source(text=text, origin="text")

    mime = (payload.get("mime_type") or "").lower()
    hint = (payload.get("filename") or "").lower()

    file_data = payload.get("file_data")
    if file_data:
        data = _decode_base64(file_data)
        logger.info(
            "[extract.source] base64 | mime=%s | file=%s | bytes=%d", mime, hint, len(data)
        )
        return Source(data=data, mime=mime, hint=hint, origin="base64")

    url = payload.get("storage_path")
    if url:
        data = _download(url)
        logger.info("[extract.source] storage | mime=%s | bytes=%d", mime, len(data))
        return Source(data=data, mime=mime, hint=hint or url.lower(), origin="storage")

    raise NoSourceError("Payload ga punya text, file_data, maupun storage_path")


def _decode_base64(raw: str) -> bytes:
    try:
        return base64.b64decode(raw)
    except Exception as e:
        raise SourceFetchError(f"file_data bukan base64 yang valid: {e}") from e


def _download(url: str) -> bytes:
    """Streaming: file gede gak numpuk dua kali di memori, dan koneksi bisa
    diputus begitu ngelewatin batas ukuran."""
    with requests.get(
        url, timeout=DOWNLOAD_TIMEOUT, verify=EXTRACT_VERIFY_SSL, stream=True
    ) as resp:
        resp.raise_for_status()

        # Content-Length dipakai buat nolak lebih awal, tapi tetep dihitung ulang
        # pas ngunduh - header bisa bohong atau gak dikirim.
        declared = resp.headers.get("Content-Length")
        if declared and declared.isdigit() and int(declared) > EXTRACT_MAX_FILE_BYTES:
            raise SourceFetchError(_too_big_msg(int(declared)))

        buf = bytearray()
        for chunk in resp.iter_content(chunk_size=_CHUNK_SIZE):
            if not chunk:
                continue
            buf.extend(chunk)
            if len(buf) > EXTRACT_MAX_FILE_BYTES:
                raise SourceFetchError(_too_big_msg(len(buf)))

    return bytes(buf)


def _too_big_msg(size: int) -> str:
    limit_mb = EXTRACT_MAX_FILE_BYTES / 1024 / 1024
    return f"File kegedean ({size / 1024 / 1024:.1f}MB), maksimal {limit_mb:.0f}MB"
