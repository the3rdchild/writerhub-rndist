import logging
import time
from contextlib import contextmanager
from datetime import datetime


class BaseService:
    def __init__(self, name: str):
        self.name = name
        self.logger = logging.getLogger(name)
        self._job_start: float | None = None

    def log_start(self, job_id: str, **extra):
        self._job_start = time.time()
        timestamp = datetime.now().strftime("%H:%M:%S")
        parts = " | ".join(f"{k}={v}" for k, v in extra.items())
        suffix = f" | {parts}" if parts else ""
        self.logger.info(f"[{self.name}] mulai | job_id={job_id}{suffix} | start: {timestamp}")

    def log_end(self, job_id: str, **extra):
        duration = time.time() - self._job_start if self._job_start else 0.0
        timestamp = datetime.now().strftime("%H:%M:%S")
        parts = " | ".join(f"{k}={v}" for k, v in extra.items())
        suffix = f" | {parts}" if parts else ""
        self.logger.info(
            f"[{self.name}] selesai | job_id={job_id}{suffix} | end: {timestamp} | duration: {duration:.2f}s"
        )

    def log_error(self, job_id: str, msg: str = "gagal"):
        duration = time.time() - self._job_start if self._job_start else 0.0
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
