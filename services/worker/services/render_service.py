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
import queue
import re
import threading
import time
import uuid
from concurrent.futures import Future

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
    RENDER_MAX_CONCURRENCY,
    RENDER_MAX_PAGES,
    RENDER_PAGE_TIMEOUT_S,
    RENDER_QUEUE_TIMEOUT_S,
    RENDER_RECORD_TTL_S,
    RENDER_WEB_URL,
)

logger = logging.getLogger(__name__)

READY_SELECTOR = 'body[data-export-ready="true"]'
PAGES_ATTRIBUTE = "data-export-pages"
CLIPPED_ATTRIBUTE = "data-export-clipped"
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
    warnings: list[str] = []

    # Format selain PDF sengaja tidak dicatat alasannya di sini: apps/api
    # sudah menuliskannya untuk tiap keluaran yang diminta tapi tidak ada di
    # `downloads` (`unrenderedReason`), dan satu kalimat yang sama tidak perlu
    # hidup di dua bahasa sekaligus. Yang penting catatannya tetap ditutup -
    # job yang pulang tanpa `done` menggantung di mata penanya status.
    if "pdf" in requested:
        try:
            _reject_stale(payload)
            pdf, meta = _print_pdf(document_id, payload)
            warnings = _render_warnings(meta)
            key = f"exports/{uuid.uuid4()}.pdf"
            _upload(key, pdf, PDF_CONTENT_TYPE)
            downloads.append({"output": "pdf", "key": key, "pages": meta["pages"]})
            logger.info(
                "[render] pdf siap | document_id=%s key=%s pages=%s",
                document_id,
                key,
                meta["pages"],
            )
        except RenderFailure as failure:
            errors.append({"output": "pdf", "reason": failure.reason})
        except PlaywrightError as error:
            logger.error("[render] peramban gagal | document_id=%s | %s", document_id, error)
            errors.append({"output": "pdf", "reason": GENERIC_RENDER_ERROR})
        except Exception:
            logger.exception("[render] job gagal total | document_id=%s", document_id)
            errors.append({"output": "pdf", "reason": GENERIC_RENDER_ERROR})

    _write_record(
        document_id,
        status="done",
        outputs=requested,
        downloads=downloads,
        errors=errors,
        warnings=warnings,
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


def _pdf_page_count(pdf: bytes) -> int:
    """Jumlah halaman berkas PDF itu sendiri, bukan tebakan paginasi layar."""
    return len(re.findall(rb"/Type\s*/Page[^s]", pdf))


def _render_warnings(meta: dict) -> list[str]:
    """Catatan penting yang tidak menggagalkan hasil - dibaca pemanggil API."""
    notes: list[str] = []

    # Isi rancangan yang terpotong di tepi lembar (T4): layar menampilkannya
    # sebagai lencana, pemanggil API tidak pernah melihat layar itu. Yang
    # terpotong biasanya justru dasar flyer - ajakan bertindaknya.
    if meta.get("clipped", 0) > 0:
        notes.append(
            f"{meta['clipped']} blok rancangan terpotong di tepi halaman - "
            "bagian itu tidak ikut ke PDF."
        )

    # Halaman PDF yang melebihi batas setelah lolos pemeriksaan angka layar
    # (T7): angka layar bisa berselisih dengan kertas. Pekerjaannya sudah
    # dibayar, jadi hasilnya tetap diserahkan - yang dijaga di sini kejujurannya
    # bagi pemanggil dan operator, bukan pembalasannya.
    if meta.get("pages", 0) > RENDER_MAX_PAGES:
        notes.append(
            f"PDF-nya {meta['pages']} halaman, melebihi batas render "
            f"({RENDER_MAX_PAGES})."
        )

    return notes


def _print_pdf(document_id: str, payload: dict) -> tuple[bytes, dict]:
    """Satu kunjungan ke halaman ekspor, satu PDF beserta ukurannya yang sebenarnya.

    Halamannya dibuka di konteks baru milik Chromium yang sudah hangat (lihat
    ``_BrowserSlot``), bukan di peramban yang diluncurkan khusus untuk job ini.
    Konteks baru berarti cookie, penyimpanan dan cache yang bersih, jadi
    isolasi antar-job tetap sama dengan peramban baru.
    """
    url = f"{RENDER_WEB_URL}/export/{document_id}?exp={payload.get('exp')}&sig={payload.get('sig')}"
    return _run_in_browser(lambda browser: _print_in(browser, url))


def _print_in(browser, url: str) -> tuple[bytes, dict]:
    timeout_ms = RENDER_PAGE_TIMEOUT_S * 1000
    context = browser.new_context()
    try:
        page = context.new_page()
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
        pdf = page.pdf(print_background=True, prefer_css_page_size=True)

        # Jumlah halaman dihitung dari berkasnya sendiri (T7): paginasi
        # layar - sumber `data-export-pages` - bisa berselisih dengannya,
        # dan selama itu mungkin, batas `RENDER_MAX_PAGES` menjaga angka
        # yang salah untuk pemeriksaan cepatnya.
        clipped_raw = page.locator("body").get_attribute(CLIPPED_ATTRIBUTE)
        clipped = int(clipped_raw) if clipped_raw and clipped_raw.isdigit() else 0
        return pdf, {"pages": _pdf_page_count(pdf), "clipped": clipped}
    finally:
        context.close()


# Chromium diluncurkan ulang sesudah sekian job, supaya memori yang pelan-pelan
# menumpuk di proses peramban yang berumur panjang tidak tumbuh tanpa batas.
_BROWSER_RECYCLE_JOBS = 200

_tasks: queue.Queue = queue.Queue()
_slots: list[threading.Thread] = []
_slots_lock = threading.Lock()


def _run_in_browser(fn):
    """Jalankan ``fn(browser)`` di salah satu benang pemilik Chromium, tunggu hasilnya.

    Galat dari ``fn`` (``RenderFailure``, ``PlaywrightError``) diteruskan apa
    adanya ke pemanggil, jadi penanganannya di ``process`` tidak berubah.
    """
    _ensure_slots()
    future: Future = Future()
    _tasks.put((fn, future))
    return future.result()


def _ensure_slots() -> None:
    if _slots:
        return
    with _slots_lock:
        if _slots:
            return
        for index in range(max(RENDER_MAX_CONCURRENCY, 1)):
            slot = _BrowserSlot(index)
            slot.start()
            _slots.append(slot)


class _BrowserSlot(threading.Thread):
    """Satu benang yang memiliki satu Playwright dan satu Chromium lintas job.

    Dulu setiap job meluncurkan Chromium sendiri, dan pada uji beban 30 Sep
    throughput render tertahan di ±1,4 PDF/dtk. Peramban tidak bisa hidup di
    benang job: API sync Playwright terikat pada benang yang membuatnya,
    sedangkan ``core/queue/worker.py`` menjalankan setiap job di benang baru
    dan meninggalkannya bila lewat tenggat. Karena itu Chromium dimiliki benang
    tetap di sini, dan benang job hanya menitipkan pekerjaannya lewat antrean.
    Benang job yang ditinggalkan tidak membawa pergi perambannya.

    Jumlah slot sama dengan ``RENDER_MAX_CONCURRENCY``, yaitu jumlah pengambil
    job render, sehingga tidak ada job yang menunggu slot dalam keadaan normal.
    """

    def __init__(self, index: int):
        super().__init__(daemon=True, name=f"render-browser-{index}")
        self._playwright = None
        self._browser = None
        self._jobs = 0

    def run(self) -> None:
        while True:
            fn, future = _tasks.get()
            if not future.set_running_or_notify_cancel():
                continue
            try:
                future.set_result(fn(self._ensure_browser()))
            except BaseException as error:  # diteruskan utuh ke benang job
                future.set_exception(error)
            finally:
                self._jobs += 1
                if self._jobs >= _BROWSER_RECYCLE_JOBS:
                    self._close_browser()

    def _ensure_browser(self):
        if self._browser is not None and self._browser.is_connected():
            return self._browser
        # Peramban yang mati (crash, OOM) diganti yang baru di job berikutnya.
        self._close_browser()
        if self._playwright is None:
            self._playwright = sync_playwright().start()
        # channel: yang terpasang di image hanya chrome-headless-shell, bukan
        # Chrome lengkap (lihat Dockerfile). Mesinnya sama - PDF-nya identik -
        # jadi ini soal apa yang ikut diangkut, bukan soal hasil.
        #
        # --no-sandbox: kontainer tidak punya userns untuk sandbox Chromium;
        # --disable-dev-shm-usage: /dev/shm kontainer 64 MB, terlalu kecil.
        try:
            self._browser = self._playwright.chromium.launch(
                channel="chromium-headless-shell",
                args=["--no-sandbox", "--disable-dev-shm-usage"],
            )
        except Exception:
            # Driver Playwright yang rusak tidak akan pulih sendiri; mulai
            # dari nol di job berikutnya.
            self._stop_playwright()
            raise
        self._jobs = 0
        logger.info("[render] Chromium diluncurkan | slot=%s", self.name)
        return self._browser

    def _close_browser(self) -> None:
        browser, self._browser = self._browser, None
        if browser is None:
            return
        try:
            browser.close()
        except Exception:
            logger.warning("[render] gagal menutup Chromium | slot=%s", self.name, exc_info=True)

    def _stop_playwright(self) -> None:
        playwright, self._playwright = self._playwright, None
        if playwright is None:
            return
        try:
            playwright.stop()
        except Exception:
            logger.warning("[render] gagal menghentikan Playwright | slot=%s", self.name, exc_info=True)


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
