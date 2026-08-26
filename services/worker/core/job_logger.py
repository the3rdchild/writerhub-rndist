"""Pencatatan log berjangka waktu untuk satu job (§P11).

Namanya sengaja bukan "BaseService": tidak ada yang mewarisi kelas ini - ia
dipakai sebagai satu instance module-level per berkas pemroses job
(`_svc = JobLogger("...")`, lihat `services/analysis_service.py`,
`services/grammar_service.py`, `services/extract/pipeline.py`). `log_start`
mengembalikan waktu mulainya, bukan menyimpannya di `self`, supaya durasi
tetap benar sekalipun beberapa job jalan bersamaan di thread berbeda
memakai instance yang sama (`WORKER_CONCURRENCY > 1`, lihat
`core/queue/worker.py`) - menyimpannya di `self` membuat job yang lebih
belakangan menimpa waktu mulai job lain di thread berbeda.
"""

import logging
import time
from contextlib import contextmanager
from datetime import datetime


class JobLogger:
    def __init__(self, name: str):
        self.name = name
        self.logger = logging.getLogger(name)

    def log_start(self, job_id: str, **extra) -> float:
        """Kembalikan waktu mulai - simpan di pemanggil, teruskan ke `log_end`/`log_error`."""
        started_at = time.time()
        timestamp = datetime.now().strftime("%H:%M:%S")
        parts = " | ".join(f"{k}={v}" for k, v in extra.items())
        suffix = f" | {parts}" if parts else ""
        self.logger.info(f"[{self.name}] mulai | job_id={job_id}{suffix} | start: {timestamp}")
        return started_at

    def log_end(self, job_id: str, started_at: float, **extra):
        duration = time.time() - started_at
        timestamp = datetime.now().strftime("%H:%M:%S")
        parts = " | ".join(f"{k}={v}" for k, v in extra.items())
        suffix = f" | {parts}" if parts else ""
        self.logger.info(
            f"[{self.name}] selesai | job_id={job_id}{suffix} | end: {timestamp} | duration: {duration:.2f}s"
        )

    def log_error(self, job_id: str, started_at: float, msg: str = "gagal"):
        duration = time.time() - started_at
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.logger.error(
            f"[{self.name}] {msg} | job_id={job_id} | end: {timestamp} | duration: {duration:.2f}s"
        )

    @contextmanager
    def timed_step(self, step_name: str):
        timer = time.time()
        try:
            yield
        finally:
            elapsed = time.time() - timer
            self.logger.info(f"[{step_name}] selesai | {elapsed:.2f}s")
