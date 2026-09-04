import threading

from core.logging.setup import setup_logging
from core.configs.env import (
    ANALYSIS_QUEUE_NAME,
    QUEUE_NAME,
    RENDER_MAX_CONCURRENCY,
    RENDER_PAGE_TIMEOUT_S,
    RENDER_QUEUE_NAME,
)
from core.db.connection import db_get_connection
from core.queue.worker import start
from workers.grammar_worker import handle as grammar_handle
from workers.analysis_worker import handle as analysis_handle
from workers.render_worker import handle as render_handle

if __name__ == "__main__":
    setup_logging()

    conn = db_get_connection()
    conn.close()
    print("[db] konek!")
    grammar_thread = threading.Thread(
        target=start, args=(grammar_handle, QUEUE_NAME), daemon=True, name="grammar-listener",
    )
    analysis_thread = threading.Thread(
        target=start, args=(analysis_handle, ANALYSIS_QUEUE_NAME), daemon=True, name="analysis-listener",
    )
    # Render punya tenggatnya sendiri: satu halaman yang macet tidak boleh
    # menggenggam slot Chromium selama tenggat job AI (5 menit).
    render_thread = threading.Thread(
        target=start,
        args=(render_handle, RENDER_QUEUE_NAME),
        kwargs={
            "concurrency": RENDER_MAX_CONCURRENCY,
            "deadline_seconds": RENDER_PAGE_TIMEOUT_S + 30,
        },
        daemon=True,
        name="render-listener",
    )
    grammar_thread.start()
    analysis_thread.start()
    render_thread.start()
    grammar_thread.join()
    analysis_thread.join()
    render_thread.join()
