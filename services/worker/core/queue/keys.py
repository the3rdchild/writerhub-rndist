"""Kunci Redis yang menyeberangi batas proses dengan apps/api.

Tata letaknya harus sama persis dengan sisi TypeScript - `wait_key`/
`job_hash_key` dengan `apps/api/src/lib/queue.ts`, `stream_channel` dengan
`apps/api/src/lib/job-events.ts` (`jobChannel`). Python tidak membaca
`packages/shared` (lihat docs/design.md §5), jadi kecocokannya cuma dijaga
lewat konvensi tertulis ini, bukan compiler - ubah kedua sisi sekaligus.
"""


def wait_key(queue_name: str) -> str:
    """Kunci Redis List BullMQ tempat job menunggu diambil (BRPOP)."""
    return f"bull:{queue_name}:wait"


def job_hash_key(queue_name: str, job_id: str) -> str:
    """Hash BullMQ berisi data satu job."""
    return f"bull:{queue_name}:{job_id}"


def stream_channel(job_id: str) -> str:
    """Kanal pub/sub tempat status job dipublikasikan untuk SSE `apps/api`.

    Nama "grammar:stream" dipertahankan apa adanya untuk job analysis juga -
    mengubahnya butuh perubahan serentak di kedua sisi.
    """
    return f"grammar:stream:{job_id}"
