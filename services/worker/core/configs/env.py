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


# ── infrastruktur ────────────────────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL", "")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

# ── antrean job (harus sama dengan apps/api) ─────────────────────────────────
QUEUE_NAME = os.getenv("GRAMMAR_QUEUE_NAME", "GRAMMAR_QUEUE")
JOB_NAME = os.getenv("GRAMMAR_JOB_NAME", "PROCESS_GRAMMAR")
ANALYSIS_QUEUE_NAME = os.getenv("ANALYSIS_QUEUE_NAME", "ANALYSIS_QUEUE")
ANALYSIS_JOB_NAME = os.getenv("ANALYSIS_JOB_NAME", "PROCESS_ANALYSIS")

# ── pemrosesan dokumen ───────────────────────────────────────────────────────
GRAMMAR_LANGUAGE = os.getenv("GRAMMAR_LANGUAGE", "en")
EXTRACT_MAX_FILE_BYTES = _int("EXTRACT_MAX_FILE_BYTES", 10 * 1024 * 1024)
EXTRACT_VERIFY_SSL = _bool("EXTRACT_VERIFY_SSL", True)

# ── AI provider bawaan ───────────────────────────────────────────────────────
# Provider utama dikirim per job oleh apps/api (hasil resolve dari admin-ppe,
# lihat core/provider.py). Nilai di bawah cuma dipakai POS tagger fallback;
# kosongkan AI_API_KEY untuk menonaktifkannya.
AI_BASE_URL = os.getenv("AI_BASE_URL", "https://openrouter.ai/api/v1/chat/completions")
AI_API_KEY = os.getenv("AI_API_KEY", "")
AI_MODEL = os.getenv("AI_MODEL", "openai/gpt-4o-mini")
AI_REFERER = os.getenv("AI_REFERER", "https://api-ppe.reacteev.id")
AI_APP_TITLE = os.getenv("AI_APP_TITLE", "writer-hub")
