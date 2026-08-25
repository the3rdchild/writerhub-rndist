import threading

from core.logging.setup import setup_logging
from core.configs.env import QUEUE_NAME, ANALYSIS_QUEUE_NAME
from core.db.connection import db_get_connection
from core.queue.worker import start
from workers.grammar_worker import handle as grammar_handle
from workers.analysis_worker import handle as analysis_handle

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
    grammar_thread.start()
    analysis_thread.start()
    grammar_thread.join()
    analysis_thread.join()
