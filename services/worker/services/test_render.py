"""Uji bagian perender yang tidak menyentuh peramban maupun jaringan.

Yang diuji di sini invariannya, bukan hasil cetaknya: catatan status **selalu**
ditutup dengan `done`, dan alasan kegagalan yang layak dibaca pemanggil draf
sampai ke catatannya. Chromium, S3 dan Redis urusan integrasi - dijalankan
lewat compose, bukan unit.
"""

import queue
import time

import pytest

from services import render_service


@pytest.fixture
def records(monkeypatch):
    """Menangkap tiap `_write_record`, jadi urutan statusnya bisa diperiksa."""
    written = []
    monkeypatch.setattr(
        render_service,
        "_write_record",
        lambda document_id, **record: written.append((document_id, record)),
    )
    return written


# Bentuk kembalian `_print_pdf`: berkasnya dan ukurannya yang sebenarnya.
PDF_OK = (b"%PDF-1.4", {"pages": 1, "clipped": 0})


def job(**payload):
    return {"payload": {"documentId": "doc-1", "outputs": ["pdf"], **payload}}


def test_payload_tanpa_dokumen_dilewati(records):
    render_service.process({"payload": {"outputs": ["pdf"]}})
    assert records == []


def test_format_tanpa_perender_tetap_menutup_catatannya(records):
    """Job yang pulang tanpa `done` menggantung selamanya di mata penanya status."""
    render_service.process(job(outputs=["docx"]))

    statuses = [record["status"] for _, record in records]
    assert statuses == ["rendering", "done"]

    _, last = records[-1]
    assert last["downloads"] == []
    # Alasannya sengaja tidak ditulis di sini - apps/api yang memilikinya
    # (`unrenderedReason`), supaya satu kalimat tidak hidup di dua bahasa.
    assert last["errors"] == []
    assert last["outputs"] == ["docx"]


def test_hasil_render_tercatat_sebagai_unduhan(records, monkeypatch):
    monkeypatch.setattr(render_service, "_print_pdf", lambda *_: PDF_OK)
    uploaded = {}
    monkeypatch.setattr(
        render_service,
        "_upload",
        lambda key, body, content_type: uploaded.update(key=key, body=body, type=content_type),
    )

    render_service.process(job())

    _, last = records[-1]
    assert last["status"] == "done"
    assert last["errors"] == []
    assert [entry["output"] for entry in last["downloads"]] == ["pdf"]
    assert last["downloads"][0]["key"] == uploaded["key"]
    assert uploaded["key"].startswith("exports/") and uploaded["key"].endswith(".pdf")
    assert uploaded["type"] == "application/pdf"


def test_alasan_kegagalan_yang_layak_dibaca_diteruskan(records, monkeypatch):
    def gagal(*_):
        raise render_service.RenderFailure("Dokumennya 94 halaman, melebihi batas render (50).")

    monkeypatch.setattr(render_service, "_print_pdf", gagal)

    render_service.process(job())

    _, last = records[-1]
    assert last["status"] == "done"
    assert last["downloads"] == []
    assert last["errors"] == [
        {"output": "pdf", "reason": "Dokumennya 94 halaman, melebihi batas render (50)."}
    ]


def test_kegagalan_tak_terduga_dijawab_alasan_generik(records, monkeypatch):
    def meledak(*_):
        raise RuntimeError("boto3 marah")

    monkeypatch.setattr(render_service, "_print_pdf", meledak)

    render_service.process(job())

    _, last = records[-1]
    assert last["errors"] == [
        {"output": "pdf", "reason": render_service.GENERIC_RENDER_ERROR}
    ]


def test_job_yang_kelamaan_mengantre_dilepas(records, monkeypatch):
    """Tokennya sudah mati di tengah antrean; menjalankannya hanya menghasilkan 401."""
    monkeypatch.setattr(
        render_service, "_print_pdf", lambda *_: pytest.fail("peramban tidak boleh dibuka")
    )
    lewat = time.time() - render_service.RENDER_QUEUE_TIMEOUT_S - 1

    render_service.process(job(enqueuedAt=lewat))

    _, last = records[-1]
    assert last["downloads"] == []
    assert "antrean" in last["errors"][0]["reason"]


def test_job_yang_masih_segar_tidak_dilepas(records, monkeypatch):
    monkeypatch.setattr(render_service, "_print_pdf", lambda *_: PDF_OK)
    monkeypatch.setattr(render_service, "_upload", lambda *_: None)

    render_service.process(job(enqueuedAt=time.time()))

    _, last = records[-1]
    assert last["errors"] == []


# -- Chromium yang dipakai ulang lintas job ---------------------------------


class FakeBrowser:
    def __init__(self):
        self.connected = True

    def is_connected(self):
        return self.connected

    def close(self):
        self.connected = False


class FakePlaywright:
    """Pengganti `sync_playwright().start()`; mencatat setiap peluncuran."""

    def __init__(self):
        self.launched = []
        self.chromium = self

    def start(self):
        return self

    def launch(self, **_):
        browser = FakeBrowser()
        self.launched.append(browser)
        return browser

    def stop(self):
        pass


@pytest.fixture
def playwright(monkeypatch):
    fake = FakePlaywright()
    monkeypatch.setattr(render_service, "sync_playwright", lambda: fake)
    monkeypatch.setattr(render_service, "_tasks", queue.Queue())
    monkeypatch.setattr(render_service, "_slots", [])
    monkeypatch.setattr(render_service, "RENDER_MAX_CONCURRENCY", 1)
    return fake


def test_peramban_dipakai_ulang_lintas_job(playwright):
    first = render_service._run_in_browser(lambda browser: browser)
    second = render_service._run_in_browser(lambda browser: browser)

    assert first is second
    assert len(playwright.launched) == 1


def test_peramban_yang_mati_diganti_di_job_berikutnya(playwright):
    crashed = render_service._run_in_browser(lambda browser: browser)
    crashed.connected = False

    replacement = render_service._run_in_browser(lambda browser: browser)

    assert replacement is not crashed
    assert len(playwright.launched) == 2


def test_galat_job_diteruskan_dan_slotnya_tetap_melayani(playwright):
    def gagal(_browser):
        raise render_service.RenderFailure("terlalu panjang")

    with pytest.raises(render_service.RenderFailure):
        render_service._run_in_browser(gagal)

    assert render_service._run_in_browser(lambda _browser: "lanjut") == "lanjut"
    assert len(playwright.launched) == 1


def test_peramban_diluncurkan_ulang_sesudah_batas_job(playwright, monkeypatch):
    monkeypatch.setattr(render_service, "_BROWSER_RECYCLE_JOBS", 2)

    first = render_service._run_in_browser(lambda browser: browser)
    render_service._run_in_browser(lambda browser: browser)
    third = render_service._run_in_browser(lambda browser: browser)

    assert not first.connected
    assert third is not first
    assert len(playwright.launched) == 2
