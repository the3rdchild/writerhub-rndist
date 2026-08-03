import io
import logging

from ..errors import CorruptFileError

logger = logging.getLogger(__name__)


def parse(data: bytes) -> str:
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(data))
        pages = reader.pages
    except Exception as e:
        raise CorruptFileError(f"PDF gak bisa dibaca: {e}") from e

    logger.info("[extract.parse:pdf] halaman=%d", len(pages))

    chunks: list[str] = []
    for i, page in enumerate(pages):
        try:
            chunks.append(page.extract_text() or "")
        except Exception as e:
            logger.warning("[extract.parse:pdf] halaman %d gagal, dilewat | %s", i + 1, e)
            chunks.append("")

    return "\n".join(chunks).strip()
