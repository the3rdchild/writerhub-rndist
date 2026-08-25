from contextlib import contextmanager
import logging

import psycopg2
from psycopg2.extras import Json
from core.configs.env import DATABASE_URL

logger = logging.getLogger(__name__)


@contextmanager
def _db():
    conn = psycopg2.connect(DATABASE_URL)
    try:
        yield conn
    finally:
        conn.close()


_GET_REQUEST_INFO = "SELECT id, tab_id, user_id FROM pool_request WHERE job_id = %s"

_UPDATE_STATUS = """
    UPDATE pool_request
    SET status = %s::pool_request_status, updated_at = NOW()
    WHERE job_id = %s
"""

_UPDATE_ERROR = """
    UPDATE pool_request
    SET error = %s, updated_at = NOW()
    WHERE job_id = %s
"""

_UPDATE_TOKENS = """
    UPDATE pool_request
    SET total_tokens = %s, updated_at = NOW()
    WHERE job_id = %s
"""

_GET_TAB_CONTENT = "SELECT content FROM document_tabs WHERE id = %s"

# trigger 'ai_result': snapshot otomatis saat job AI selesai (lihat
# metadata-version.ts di apps/api).
_INSERT_VERSION = """
    INSERT INTO document_versions (tab_id, content, trigger, word_count, created_by)
    VALUES (%s, %s, 'ai_result', %s, %s)
    RETURNING id
"""

# job_id unik → upsert biar idempotent kalau job diproses ulang
_INSERT_METADATA_VERSION = """
    INSERT INTO metadata_version (job_id, request_id, version_id, feature, result)
    VALUES (%s, %s, %s, %s, %s)
    ON CONFLICT (job_id) DO UPDATE SET
        version_id = EXCLUDED.version_id,
        feature    = EXCLUDED.feature,
        result     = EXCLUDED.result,
        updated_at = NOW()
"""


def update_status(job_id: str, status: str) -> None:
    with _db() as conn:
        with conn.cursor() as cur:
            cur.execute(_UPDATE_STATUS, (status, job_id))
        conn.commit()
    logger.info("[db] status %s → %s", job_id, status)


def update_tokens(job_id: str, total_tokens: int | None) -> None:
    if total_tokens is None:
        return
    with _db() as conn:
        with conn.cursor() as cur:
            cur.execute(_UPDATE_TOKENS, (total_tokens, job_id))
        conn.commit()
    logger.info("[db] total_tokens disimpan | job_id=%s | total_tokens=%s", job_id, total_tokens)


def get_request_info(job_id: str) -> dict | None:
    """`request_id` + `tab_id` (bisa None - tab basi/tak tertaut) + `user_id`
    (bisa None) sebuah job, dari `pool_request`."""
    with _db() as conn:
        with conn.cursor() as cur:
            cur.execute(_GET_REQUEST_INFO, (job_id,))
            row = cur.fetchone()
    if not row:
        return None
    return {
        "request_id": str(row[0]),
        "tab_id": str(row[1]) if row[1] else None,
        "user_id": row[2],
    }


def _count_words(content: dict | None) -> int:
    """Hitung kata dari JSON ProseMirror - port dari `countWords` di
    apps/api/src/services/versions/service.ts, harus tetap sama persis."""
    count = 0

    def walk(node) -> None:
        nonlocal count
        if not isinstance(node, dict):
            return
        text = node.get("text")
        if isinstance(text, str) and text.strip():
            count += len(text.strip().split())
        children = node.get("content")
        if isinstance(children, list):
            for child in children:
                walk(child)

    walk(content or {})
    return count


def save_metadata_version(
    request_id: str,
    job_id: str,
    tab_id: str | None,
    user_id: str | None,
    feature: str,
    result: dict,
) -> None:
    """Simpan hasil job (grammar atau salah satu analysis feature) sebagai satu
    baris `metadata_version`, menempel ke snapshot `document_versions` baru
    (trigger 'ai_result') dari konten tab TERKINI.

    Kalau `tab_id` kosong (job tidak tertaut tab) atau tabnya sudah dihapus,
    hasil TIDAK BISA disimpan permanen - metadata_version.version_id wajib
    menunjuk document_versions yang valid. Ini konsekuensi desain yang
    disengaja (metadata_version nempel ke version, bukan job); dilewati
    dengan log warning, bukan exception, supaya job tetap dianggap selesai.
    """
    if not tab_id:
        logger.warning(
            "[db] metadata_version dilewati - job tidak tertaut tab | job_id=%s feature=%s",
            job_id, feature,
        )
        return

    with _db() as conn:
        with conn.cursor() as cur:
            cur.execute(_GET_TAB_CONTENT, (tab_id,))
            row = cur.fetchone()
            if not row:
                logger.warning(
                    "[db] metadata_version dilewati - tab %s sudah dihapus | job_id=%s",
                    tab_id, job_id,
                )
                return
            content = row[0]
            word_count = _count_words(content)

            cur.execute(_INSERT_VERSION, (tab_id, Json(content), word_count, user_id))
            version_id = cur.fetchone()[0]

            cur.execute(
                _INSERT_METADATA_VERSION,
                (job_id, request_id, version_id, feature, Json(result)),
            )
        conn.commit()
    logger.info("[db] metadata_version tersimpan | job_id=%s feature=%s", job_id, feature)


def save_error(job_id: str, message: str) -> None:
    with _db() as conn:
        with conn.cursor() as cur:
            cur.execute(_UPDATE_ERROR, (message, job_id))
        conn.commit()
    logger.info("[db] error tersimpan | job_id=%s", job_id)
