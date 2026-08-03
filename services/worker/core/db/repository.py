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


_GET_REQUEST_ID = "SELECT id FROM pool_request WHERE job_id = %s"

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

# job_id unik → upsert biar idempotent kalau job di-proses ulang
_INSERT_ANALYSIS_RESULT = """
    INSERT INTO analysis_result (job_id, request_id, feature, result)
    VALUES (%s, %s, %s, %s)
    ON CONFLICT (job_id) DO UPDATE SET
        feature    = EXCLUDED.feature,
        result     = EXCLUDED.result,
        updated_at = NOW()
"""

# job_id unik → upsert biar idempotent kalau job di-proses ulang
_INSERT_GRAMMAR_RESULT = """
    INSERT INTO grammar_result
        (job_id, request_id, original_text, corrected_text,
         suggestions, scores, writing_quality, quality_label)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (job_id) DO UPDATE SET
        original_text   = EXCLUDED.original_text,
        corrected_text  = EXCLUDED.corrected_text,
        suggestions     = EXCLUDED.suggestions,
        scores          = EXCLUDED.scores,
        writing_quality = EXCLUDED.writing_quality,
        quality_label   = EXCLUDED.quality_label,
        updated_at      = NOW()
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


def get_request_id(job_id: str) -> str | None:
    with _db() as conn:
        with conn.cursor() as cur:
            cur.execute(_GET_REQUEST_ID, (job_id,))
            row = cur.fetchone()
    return str(row[0]) if row else None


def save_grammar_result(
    request_id: str,
    job_id: str,
    original_text: str,
    corrected_text: str,
    suggestions: list[dict],
    scores: dict,
    writing_quality: int,
    quality_label: str,
) -> None:
    with _db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                _INSERT_GRAMMAR_RESULT,
                (
                    job_id,
                    request_id,
                    original_text,
                    corrected_text,
                    Json(suggestions),
                    Json(scores),
                    writing_quality,
                    quality_label,
                ),
            )
        conn.commit()
    logger.info("[db] grammar_result tersimpan | job_id=%s (%d suggestions)", job_id, len(suggestions))


def save_analysis_result(
    request_id: str,
    job_id: str,
    feature: str,
    result: dict,
) -> None:
    with _db() as conn:
        with conn.cursor() as cur:
            cur.execute(_INSERT_ANALYSIS_RESULT, (job_id, request_id, feature, Json(result)))
        conn.commit()
    logger.info("[db] analysis_result tersimpan | job_id=%s feature=%s", job_id, feature)


def save_error(job_id: str, message: str) -> None:
    with _db() as conn:
        with conn.cursor() as cur:
            cur.execute(_UPDATE_ERROR, (message, job_id))
        conn.commit()
    logger.info("[db] error tersimpan | job_id=%s", job_id)
