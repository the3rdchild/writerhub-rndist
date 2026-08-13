"""
Uji batas waktu job & penandaan kegagalan (§P11, B-10).

Hanya menguji `_run_with_deadline` - bagian murni threading yang memutuskan
apakah job ditandai failed setelah JOB_DEADLINE_SECONDS. BRPOP dan Redis
urusan integrasi, bukan unit.
"""

import threading
import time

import pytest

from core.queue import worker


def test_handler_cepat_tidak_ditandai_failed(monkeypatch):
    called = {"failed": False}
    monkeypatch.setattr(worker, "_mark_failed", lambda *a, **k: called.__setitem__("failed", True))

    done = threading.Event()

    def handler(_data):
        done.set()

    worker._run_with_deadline(handler, {}, "job-1", "test")
    assert done.is_set()
    assert called["failed"] is False


def test_handler_lewat_batas_waktu_ditandai_failed(monkeypatch):
    marked = {}
    monkeypatch.setattr(worker, "_mark_failed", lambda job_id, msg: marked.update(job_id=job_id, msg=msg))

    # Paksa batas waktu sangat pendek untuk uji, dengan handler yang tidur lebih lama.
    monkeypatch.setattr(worker, "JOB_DEADLINE_SECONDS", 0.05)

    started = threading.Event()

    def handler(_data):
        started.set()
        time.sleep(1.0)  # jauh melebihi batas 0.05s

    worker._run_with_deadline(handler, {}, "job-2", "test")

    assert started.is_set()
    assert marked.get("job_id") == "job-2"
    assert "batas waktu" in marked.get("msg", "").lower() or "deadline" in marked.get("msg", "").lower()


def test_handler_melempar_pengecualian_tidak_ditandai_failed(monkeypatch):
    # Handler sendiri menangani error-nya (service menandai failed secara internal);
    # _run_with_deadline hanya menandai kalau LEWAT BATAS WAKTU, bukan kalau melempar.
    monkeypatch.setattr(worker, "_mark_failed", lambda *a, **k: pytest.fail("tidak boleh ditandai"))

    def handler(_data):
        raise RuntimeError("boom")

    # Tidak boleh melempar keluar - pengecualian handler ditelan & dicatat.
    worker._run_with_deadline(handler, {}, "job-3", "test")
