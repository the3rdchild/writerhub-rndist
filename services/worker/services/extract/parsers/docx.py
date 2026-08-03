import io
import logging

from ..errors import CorruptFileError

logger = logging.getLogger(__name__)


def parse(data: bytes) -> str:
    import docx

    try:
        document = docx.Document(io.BytesIO(data))
    except Exception as e:
        raise CorruptFileError(f"DOCX gak bisa dibaca: {e}") from e

    paragraphs = [p.text for p in document.paragraphs]
    logger.info("[extract.parse:docx] paragraf=%d", len(paragraphs))
    return "\n".join(paragraphs).strip()
