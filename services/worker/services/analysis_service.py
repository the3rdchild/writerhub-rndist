import json

import redis as redis_lib

from core.base_service import BaseService
from core.configs.env import REDIS_URL
from core.db.repository import (
    update_status,
    update_tokens,
    get_request_id,
    save_analysis_result,
    save_error,
)
from services.analyzers import (
    run_ai_detector,
    run_ai_rewriter,
    run_humanizer,
    run_plagiarism,
)
from services.analyzers.llm_client import get_last_total_tokens
from core.provider import resolve_provider

_svc = BaseService("analysis_service")

_redis = redis_lib.from_url(REDIS_URL, decode_responses=True)

_ANALYZERS = {
    "ai_detector": run_ai_detector,
    "ai_rewriter": run_ai_rewriter,
    "humanizer": run_humanizer,
    "plagiarism": run_plagiarism,
}

# Plagiarism murni heuristik — tidak memanggil LLM sama sekali, jadi tetap bisa
# jalan tanpa provider. Sisanya butuh LLM.
_NEEDS_PROVIDER = frozenset({"ai_detector", "ai_rewriter", "humanizer"})


def process(data: dict):
    """
    Otak nya worker-analysis.
    Nerima job dari queue → update status → jalanin analyzer → simpen hasil.
    """
    job_id  = data.get("jobId")
    payload = data.get("payload") or {}

    if not job_id:
        _svc.logger.error("[analysis_service] job_id kagak ada, skip")
        return

    _svc.log_start(job_id, feature=payload.get("feature"))

    request_id = payload.get("request_id") or get_request_id(job_id)
    if not request_id:
        _svc.logger.error("[analysis_service] pool_request nga ketemu | job_id=%s", job_id)
        return

    update_status(job_id, "processing")
    channel = f"grammar:stream:{job_id}"

    try:
        feature = payload.get("feature")
        text = payload.get("text") or ""
        analyzer = _ANALYZERS.get(feature)
        if not analyzer:
            raise ValueError(f"Unknown feature: {feature}")
        if not text.strip():
            raise ValueError("Teks kosong")

        provider = resolve_provider(payload)
        if provider is None and feature in _NEEDS_PROVIDER:
            raise ValueError(
                f"Fitur '{feature}' butuh LLM. Isi AI_API_KEY dan AI_BASE_URL di env worker, "
                "atau jalankan lewat apps/api yang terhubung ke admin-ppe."
            )

        with _svc.timed_step(f"analyze:{feature}"):
            result = analyzer(text, provider)

        update_tokens(job_id, get_last_total_tokens())

        save_analysis_result(
            request_id=request_id,
            job_id=job_id,
            feature=feature,
            result=result,
        )
        update_status(job_id, "completed")
        _publish(channel, {"type": "done", "result": result})
        _svc.log_end(job_id)
    except Exception as e:
        _svc.logger.exception("[analysis_service] error | job_id=%s", job_id)
        _svc.log_error(job_id)
        try:
            save_error(job_id, str(e))
        except Exception:
            _svc.logger.exception("[analysis_service] gagal nyimpen error | job_id=%s", job_id)
        update_status(job_id, "failed")
        _publish(channel, {"type": "error", "message": str(e)})


def _publish(channel: str, payload: dict):
    try:
        _redis.publish(channel, json.dumps(payload))
    except Exception:
        _svc.logger.warning("[analysis_service] gagal publish ke Redis channel %s", channel)
