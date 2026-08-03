import time
import redis
import json
import logging
from core.configs.env import REDIS_URL, QUEUE_NAME

logger = logging.getLogger(__name__)


def start(handler, queue_name: str = QUEUE_NAME):
    """
    Nunggu job dari Redis pake BRPOP.
    Pas ada job masuk, langsung lempar ke handler.
    queue_name opsional — default queue grammar (backward compatible).
    """
    r = redis.from_url(REDIS_URL)
    wait_key = f"bull:{queue_name}:wait"
    label = f"worker-{queue_name.lower()}"

    logger.info(f"[{label}] dengerin {wait_key}...")

    while True:
        try:
            result = r.brpop(wait_key, timeout=5)
        except redis.exceptions.TimeoutError:
            continue  # idle, ga ada job (socket read timeout pas blocking) — normal
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

        logger.info(f"[job masuk] queue={queue_name} id={job_id}")

        try:
            handler(data)
        except Exception as e:
            logger.error(f"[job error] id={job_id} | {e}")

        # bersihin hash job biar ga numpuk (kita konsumsi pake BRPOP, bypass lifecycle BullMQ)
        r.delete(f"bull:{queue_name}:{job_id}")
