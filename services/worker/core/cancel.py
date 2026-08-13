"""
Pembatalan kooperatif job worker (§P7 lapis C).

Worker tidak bisa dipaksa berhenti di tengah panggilan LLM, jadi pembatalan
dilakukan lewat titik-titik periksa: API menyalakan bendera Redis
`job:{id}:cancel` (§P7 lapis B), dan worker memeriksanya di sela-sela kerja.
Begitu bendera menyala, hasil tidak disimpan dan status ditandai 'cancelled'.

LLM sendiri dibatasi timeout 60 detik (llm_client._TIMEOUT), jadi jendela macet
maksimum terikat pada jumlah panggilan per job; titik periksa ini yang
memperkecilnya setelah tiap analyzer selesai.
"""

import logging

import redis as redis_lib

from core.configs.env import REDIS_URL

logger = logging.getLogger(__name__)

_redis = redis_lib.from_url(REDIS_URL, decode_responses=True)


class CancelledError(Exception):
    """Job dibatalkan pengguna di tengah pemrosesan."""


def _flag_key(job_id: str) -> str:
    return f"job:{job_id}:cancel"


def is_cancelled(job_id: str) -> bool:
    """True kalau bendera cancel untuk job ini menyala di Redis."""
    try:
        return _redis.exists(_flag_key(job_id)) == 1
    except Exception:
        # Redis boleh gagal sesaat; jangan gantungkan job hanya karena cek batal
        # tidak bisa dibaca. Pembatalan best-effort, bukan jaminan.
        return False


def check_cancelled(job_id: str) -> None:
    """Naikkan CancelledError bila job sudah ditandai batal.

    Dipanggil di titik-titik periksa: sebelum analyzer, sesudahnya, dan sebelum
    menyimpan hasil. Letaknya yang menentukan kapan hasil benar-benar dibuang.
    """
    if is_cancelled(job_id):
        logger.info("[cancel] titik periksa terjangkit | job_id=%s", job_id)
        raise CancelledError(job_id)


def clear_flag(job_id: str) -> None:
    """Buang bendera cancel setelah job selesai (apa pun hasilnya)."""
    try:
        _redis.delete(_flag_key(job_id))
    except Exception:
        pass
