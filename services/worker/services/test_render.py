"""Uji bagian perender yang tidak menyentuh peramban maupun jaringan.

Yang diuji di sini invariannya, bukan hasil cetaknya: catatan status **selalu**
ditutup dengan `done`, dan alasan kegagalan yang layak dibaca pemanggil draf
sampai ke catatannya. Chromium, S3 dan Redis urusan integrasi - dijalankan
lewat compose, bukan unit.
"""

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
    monkeypatch.setattr(render_service, "_print_pdf", lambda *_: b"%PDF-1.4")
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
    monkeypatch.setattr(render_service, "_print_pdf", lambda *_: b"%PDF-1.4")
    monkeypatch.setattr(render_service, "_upload", lambda *_: None)

    render_service.process(job(enqueuedAt=time.time()))

    _, last = records[-1]
    assert last["errors"] == []
