import time
import threading
import redis
import json
import logging
from core.configs.env import (
    REDIS_URL,
    QUEUE_NAME,
    JOB_DEADLINE_SECONDS,
    WORKER_CONCURRENCY,
)

logger = logging.getLogger(__name__)


def _mark_failed(job_id: str | None, message: str) -> None:
    """Tandai job gagal lewat DB (§P11). Diimpor terlambat supaya modul ini
       tetap bisa diimpor tanpa psycopg2 saat diuji terpisah."""
    if not job_id:
        return
    try:
        from core.db.repository import save_error, update_status

        save_error(job_id, message)
        update_status(job_id, "failed")
    except Exception:
        logger.exception("[worker] gagal menandai job failed | job_id=%s", job_id)


def _run_with_deadline(handler, data: dict, job_id: str | None, label: str) -> None:
    """Jalankan handler di thread anak; lewat JOB_DEADLINE_SECONDS → tandai failed
       dan kembali ke antrean, jadi satu job menggantung tidak membekukan semuanya.

       Thread anak yang tertinggal TIDAK dipaksa berhenti (Python tak punya kill
       thread yang aman) - ia mati sendiri karena requests ber-timeout 60 detik.
    """
    done = threading.Event()

    def _target():
        try:
            handler(data)
        except Exception as e:
            logger.error(f"[{label}] job error | id={job_id} | {e}")
        finally:
            done.set()

    worker = threading.Thread(target=_target, name=f"{label}-job-{job_id}", daemon=True)
    worker.start()
    worker.join(timeout=JOB_DEADLINE_SECONDS)

    if worker.is_alive():
        # Lewat batas waktu. Antrian maju; thread anak dibiarkan selesai sendiri.
        logger.error(
            "[%s] job melebihi batas waktu %ds | id=%s", label, JOB_DEADLINE_SECONDS, job_id
        )
        _mark_failed(job_id, f"Job melebihi batas waktu ({JOB_DEADLINE_SECONDS}s)")


def _consumer(handler, queue_name: str, r, label: str) -> None:
    wait_key = f"bull:{queue_name}:wait"

    while True:
        try:
            result = r.brpop(wait_key, timeout=5)
        except redis.exceptions.TimeoutError:
            continue  # idle, ga ada job (socket read timeout pas blocking) - normal
        except redis.exceptions.ConnectionError as e:
            logger.warning(f"[{label}] redis connection error: {e}, retry...")
            time.sleep(1)
            continue

        if result is None:
            continue

        _, job_id = result
        job_id = job_id.decode()

        rawdata = r.hgetall(f"bull:{queue_name}:{job_id}")
        job = {k.decode(): v.decode() for k, v in rawdata.items()}
        data = json.loads(job.get("data", "{}"))
        # jobId untuk penandaan batas waktu/batal (§P11) - ambil dari payload,
        # bukan dari kunci hash, sebab service membacanya dari sini.
        payload_job_id = data.get("jobId") if isinstance(data, dict) else None

        logger.info(f"[job masuk] queue={queue_name} id={job_id}")

        _run_with_deadline(handler, data, payload_job_id, label)

        # bersihin hash job biar ga numpuk (kita konsumsi pake BRPOP, bypass lifecycle BullMQ)
        r.delete(f"bull:{queue_name}:{job_id}")


def start(handler, queue_name: str = QUEUE_NAME, concurrency: int = WORKER_CONCURRENCY):
    """
    Nunggu job dari Redis pake BRPOP, lalu lempar ke handler.
    queue_name opsional - default queue grammar (backward compatible).

    concurrency: jumlah pengambil paralel per antrean (§P11). Satu job tier AI
    memakan puluhan detik; tanpa ini satu pemakai mengunci yang lain.
    """
    r = redis.from_url(REDIS_URL)
    wait_key = f"bull:{queue_name}:wait"
    label = f"worker-{queue_name.lower()}"

    logger.info(
        f"[{label}] dengerin {wait_key} (concurrency={concurrency}, deadline={JOB_DEADLINE_SECONDS}s)..."
    )

    if concurrency <= 1:
        _consumer(handler, queue_name, r, label)
        return

    threads = []
    for i in range(concurrency):
        t = threading.Thread(
            target=_consumer, args=(handler, queue_name, r, f"{label}-{i}"),
            daemon=True, name=f"{label}-{i}",
        )
        t.start()
        threads.append(t)

    for t in threads:
        t.join()
