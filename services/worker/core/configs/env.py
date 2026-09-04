"""Konfigurasi worker. Semua nilai dibaca sekali saat import."""

import os

from dotenv import load_dotenv

load_dotenv()


def _int(key: str, default: int) -> int:
    try:
        return int(os.getenv(key, ""))
    except ValueError:
        return default


def _bool(key: str, default: bool) -> bool:
    raw = os.getenv(key)
    return default if raw is None else raw.strip().lower() not in ("false", "0", "no")
DATABASE_URL = os.getenv("DATABASE_URL", "")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
QUEUE_NAME = os.getenv("GRAMMAR_QUEUE_NAME", "GRAMMAR_QUEUE")
JOB_NAME = os.getenv("GRAMMAR_JOB_NAME", "PROCESS_GRAMMAR")
ANALYSIS_QUEUE_NAME = os.getenv("ANALYSIS_QUEUE_NAME", "ANALYSIS_QUEUE")
ANALYSIS_JOB_NAME = os.getenv("ANALYSIS_JOB_NAME", "PROCESS_ANALYSIS")
GRAMMAR_LANGUAGE = os.getenv("GRAMMAR_LANGUAGE", "en")
EXTRACT_MAX_FILE_BYTES = _int("EXTRACT_MAX_FILE_BYTES", 10 * 1024 * 1024)
EXTRACT_VERIFY_SSL = _bool("EXTRACT_VERIFY_SSL", True)
JOB_DEADLINE_SECONDS = _int("JOB_DEADLINE_SECONDS", 300)
WORKER_CONCURRENCY = _int("WORKER_CONCURRENCY", 2)
AI_BASE_URL = os.getenv("AI_BASE_URL", "https://openrouter.ai/api/v1/chat/completions")
AI_API_KEY = os.getenv("AI_API_KEY", "")
AI_MODEL = os.getenv("AI_MODEL", "openai/gpt-4o-mini")
AI_REFERER = os.getenv("AI_REFERER", "https://api-ppe.reacteev.id")
AI_APP_TITLE = os.getenv("AI_APP_TITLE", "writer-hub")

# ── Render berkas (PDF) ──────────────────────────────────────────────
# Nama antrean harus sama persis dengan RENDER_QUEUE_NAME di apps/api.
RENDER_QUEUE_NAME = os.getenv("RENDER_QUEUE_NAME", "RENDER_QUEUE")
# Alamat apps/web sebagaimana dilihat dari dalam jaringan worker - di dalam
# compose itu `http://web:3000`, bukan WEB_URL apps/api yang ditujukan ke luar.
RENDER_WEB_URL = os.getenv("RENDER_WEB_URL", "http://localhost:3000")
RENDER_MAX_CONCURRENCY = _int("RENDER_MAX_CONCURRENCY", 2)
RENDER_PAGE_TIMEOUT_S = _int("RENDER_PAGE_TIMEOUT_S", 120)
RENDER_QUEUE_TIMEOUT_S = _int("RENDER_QUEUE_TIMEOUT_S", 300)
RENDER_MAX_PAGES = _int("RENDER_MAX_PAGES", 50)
# Umur catatan hasil di Redis; sedikit lebih panjang dari lifecycle objeknya.
RENDER_RECORD_TTL_S = _int("RENDER_RECORD_TTL_S", 26 * 3600)

# ── Penyimpanan objek (unggah hasil render; sama dengan apps/api) ─────
CDN_ENDPOINT = os.getenv("CDN_ENDPOINT", "")
CDN_REGION = os.getenv("CDN_REGION", "us-east-1")
CDN_ACCESS_KEY_ID = os.getenv("CDN_ACCESS_KEY_ID", "")
CDN_SECRET_ACCESS_KEY = os.getenv("CDN_SECRET_ACCESS_KEY", "")
CDN_BUCKET_NAME = os.getenv("CDN_BUCKET_NAME", "")
