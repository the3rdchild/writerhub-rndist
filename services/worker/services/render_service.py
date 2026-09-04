"""Render dokumen jadi berkas (PDF) lewat peramban tanpa kepala.

Worker ini tidak tahu apa-apa tentang penulisan naskah. Ia membuka halaman
ekspor yang menyusun dokumennya sendiri - ``DocumentPaper`` yang sama dengan
kanvas penyunting, lengkap dengan aturan ``@page`` - lalu mencetaknya lewat
CDP ``Page.printToPDF``: satu mesin cetak dengan Ctrl+P penulisnya, bukan
implementasi PDF kedua di server.

Alur satu job::

    queued (ditulis apps/api)
      -> rendering   (ditulis di sini, sebelum peramban dibuka)
      -> done        berisi ``downloads`` dan/atau ``errors``

Catatannya disimpan di Redis ``draft:render:<documentId>`` dan dibaca
apps/api saat menyusun tautan unduh. Berkasnya diunggah ke penyimpanan objek
dengan prefix ``exports/`` - privasi dijaga presigned URL, bukan ACL publik.
"""

import json
import logging
import threading
import time
import uuid

import boto3
import redis
from botocore.config import Config as BotoConfig
from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import sync_playwright

from core.configs.env import (
    CDN_ACCESS_KEY_ID,
    CDN_BUCKET_NAME,
    CDN_ENDPOINT,
    CDN_REGION,
    CDN_SECRET_ACCESS_KEY,
    REDIS_URL,
    RENDER_MAX_PAGES,
    RENDER_PAGE_TIMEOUT_S,
    RENDER_QUEUE_TIMEOUT_S,
    RENDER_RECORD_TTL_S,
    RENDER_WEB_URL,
)

logger = logging.getLogger(__name__)

READY_SELECTOR = 'body[data-export-ready="true"]'
PAGES_ATTRIBUTE = "data-export-pages"
PDF_CONTENT_TYPE = "application/pdf"
GENERIC_RENDER_ERROR = (
    "Render PDF-nya gagal di server. Dokumennya tetap utuh dan bisa dicetak dari WritingHub."
)

# Klien Redis aman dipakai lintas benang dan koneksinya baru dibuka saat
# perintah pertama, jadi ia boleh dibuat sekali saat impor.
_record = redis.from_url(REDIS_URL)
_s3 = None
_s3_lock = threading.Lock()


class RenderFailure(Exception):
    """Kegagalan yang alasannya layak dibaca pemanggil draf, bukan hanya log."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


def process(data: dict) -> None:
    payload = (data or {}).get("payload") or {}
    document_id = payload.get("documentId")
    requested = [o for o in (payload.get("outputs") or []) if isinstance(o, str)]

    if not document_id or not requested:
        logger.warning("[render] payload tidak lengkap, job dilewati: %s", data)
        return

    logger.info("[render] mulai | document_id=%s outputs=%s", document_id, requested)
    _write_record(document_id, status="rendering", outputs=requested)

    downloads: list[dict] = []
    errors: list[dict] = []

    # Format selain PDF sengaja tidak dicatat alasannya di sini: apps/api
    # sudah menuliskannya untuk tiap keluaran yang diminta tapi tidak ada di
    # `downloads` (`unrenderedReason`), dan satu kalimat yang sama tidak perlu
    # hidup di dua bahasa sekaligus. Yang penting catatannya tetap ditutup -
    # job yang pulang tanpa `done` menggantung di mata penanya status.
    if "pdf" in requested:
        try:
            _reject_stale(payload)
            key = f"exports/{uuid.uuid4()}.pdf"
            _upload(key, _print_pdf(document_id, payload), PDF_CONTENT_TYPE)
            downloads.append({"output": "pdf", "key": key})
            logger.info("[render] pdf siap | document_id=%s key=%s", document_id, key)
        except RenderFailure as failure:
            errors.append({"output": "pdf", "reason": failure.reason})
        except PlaywrightError as error:
            logger.error("[render] peramban gagal | document_id=%s | %s", document_id, error)
            errors.append({"output": "pdf", "reason": GENERIC_RENDER_ERROR})
        except Exception:
            logger.exception("[render] job gagal total | document_id=%s", document_id)
            errors.append({"output": "pdf", "reason": GENERIC_RENDER_ERROR})

    _write_record(
        document_id, status="done", outputs=requested, downloads=downloads, errors=errors
    )


def _reject_stale(payload: dict) -> None:
    """Job yang mengantre terlalu lama dilepaskan, bukan dijalankan.

    Token halaman ekspornya berumur antrean + satu render; mengeksekusi job
    yang sudah lewat umurnya hanya menghasilkan 401 yang membingungkan.
    """
    enqueued_at = payload.get("enqueuedAt")
    if not isinstance(enqueued_at, (int, float)):
        return
    if time.time() - enqueued_at <= RENDER_QUEUE_TIMEOUT_S:
        return
    raise RenderFailure(
        "Rendernya menunggu terlalu lama di antrean dan dilepaskan. "
        "Coba minta ulang dokumennya."
    )


def _print_pdf(document_id: str, payload: dict) -> bytes:
    """Satu kunjungan ke halaman ekspor, satu PDF.

    Perambannya diluncurkan dan ditutup di dalam satu panggilan ini, bukan
    dihangatkan lintas job. Kolam yang hangat memang menghemat 1-2 detik dari
    render 3-8 detik, tapi ia tidak punya tempat untuk hidup di sini:
    `core/queue/worker.py` menjalankan tiap job di **benang baru**, jadi
    penyimpanan per-benang berumur satu job - dan benang yang ditinggalkan
    karena lewat tenggat tidak pernah kembali untuk menutup perambannya.
    Chromium yang bocor per job jauh lebih mahal daripada detik yang dihemat.
    """
    url = f"{RENDER_WEB_URL}/export/{document_id}?exp={payload.get('exp')}&sig={payload.get('sig')}"
    timeout_ms = RENDER_PAGE_TIMEOUT_S * 1000

    with sync_playwright() as playwright:
        # channel: yang terpasang di image hanya chrome-headless-shell, bukan
        # Chrome lengkap (lihat Dockerfile). Mesinnya sama - PDF-nya identik -
        # jadi ini soal apa yang ikut diangkut, bukan soal hasil.
        #
        # --no-sandbox: kontainer tidak punya userns untuk sandbox Chromium;
        # --disable-dev-shm-usage: /dev/shm kontainer 64 MB, terlalu kecil.
        browser = playwright.chromium.launch(
            channel="chromium-headless-shell",
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        try:
            page = browser.new_page()
            page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            page.wait_for_selector(READY_SELECTOR, timeout=timeout_ms)
            # Font data: URI dimuat asinkron; tanpa ini potret pertama bisa
            # terambil sebelum fontnya siap dan hasilnya memakai font sistem.
            # Hasilnya dibuang jadi boolean - FontFaceSet sendiri tidak bisa
            # diserialkan menyeberangi CDP.
            page.evaluate("document.fonts.ready.then(() => true)")

            pages = page.locator("body").get_attribute(PAGES_ATTRIBUTE)
            if pages and pages.isdigit() and int(pages) > RENDER_MAX_PAGES:
                raise RenderFailure(
                    f"Dokumennya {pages} halaman, melebihi batas render ({RENDER_MAX_PAGES}). "
                    "Buka di WritingHub dan cetak dari sana."
                )

            # prefer_css_page_size: ukuran lembar dan marginnya milik @page yang
            # disuntikkan DocumentPaper - flyer A4 dan paper IEEE tidak bisa lahir
            # dari satu pasangan `format`/`margin` di sini.
            return page.pdf(print_background=True, prefer_css_page_size=True)
        finally:
            browser.close()


def _upload(key: str, body: bytes, content_type: str) -> None:
    _s3_client().put_object(
        Bucket=CDN_BUCKET_NAME, Key=key, Body=body, ContentType=content_type
    )


def _s3_client():
    global _s3
    if _s3 is None:
        with _s3_lock:
            if _s3 is None:
                _s3 = boto3.client(
                    "s3",
                    endpoint_url=CDN_ENDPOINT or None,
                    region_name=CDN_REGION or None,
                    aws_access_key_id=CDN_ACCESS_KEY_ID,
                    aws_secret_access_key=CDN_SECRET_ACCESS_KEY,
                    # path-style, sama dengan forcePathStyle di apps/api
                    config=BotoConfig(signature_version="s3v4", s3={"addressing_style": "path"}),
                )
    return _s3


def _write_record(document_id: str, **record) -> None:
    """Tulis catatan status, lengkap dengan cap waktunya.

    `at` bukan hiasan: apps/api memakainya untuk membedakan render yang masih
    berjalan dari worker yang mati di tengah jalan - keduanya terlihat sama
    dari catatan `rendering` yang tidak pernah berubah lagi.
    """
    try:
        _record.setex(
            f"draft:render:{document_id}",
            RENDER_RECORD_TTL_S,
            json.dumps({**record, "at": int(time.time())}),
        )
    except Exception:
        # Catatan ini pelacak, bukan sumber kebenaran: gagal mencatat tidak
        # boleh menggagalkan render yang berkasnya sudah tersimpan.
        logger.exception("[render] gagal mencatat status | document_id=%s", document_id)
