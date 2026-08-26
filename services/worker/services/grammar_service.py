import json

import redis as redis_lib

from core.job_logger import JobLogger
from core.cancel import CancelledError, check_cancelled, clear_flag
from core.configs.env import GRAMMAR_LANGUAGE, REDIS_URL
from core.queue.keys import stream_channel
from core.db.repository import (
    update_status,
    update_tokens,
    get_request_info,
    save_metadata_version,
    save_error,
)
from core.provider import provider_from_payload
from services.extract import resolve_text
from services.checker import analyze_grammar

_svc = JobLogger("grammar_service")

_redis = redis_lib.from_url(REDIS_URL, decode_responses=True)


def process(data: dict):
    """
    Otak nya worker-grammar.
    Nerima job dari queue → update status → proses teks → simpen hasil.
    """
    job_id  = data.get("jobId")
    payload = data.get("payload") or {}

    if not job_id:
        _svc.logger.error("[grammar_service] job_id kagak ada, skip")
        return

    started_at = _svc.log_start(job_id)

    request = get_request_info(job_id)
    if not request:
        _svc.logger.error("[grammar_service] pool_request nga ketemu | job_id=%s", job_id)
        return

    update_status(job_id, "processing")

    try:
        _run(job_id, request, payload)
        _svc.log_end(job_id, started_at)
    except CancelledError:
        _svc.logger.info("[grammar_service] dibatalkan | job_id=%s", job_id)
        update_status(job_id, "cancelled")
        _publish(stream_channel(job_id), {"type": "cancelled"})
        clear_flag(job_id)
    except Exception as e:
        _svc.logger.exception("[grammar_service] error | job_id=%s", job_id)
        _svc.log_error(job_id, started_at)
        try:
            save_error(job_id, str(e))
        except Exception:
            _svc.logger.exception("[grammar_service] gagal nyimpen error | job_id=%s", job_id)
        update_status(job_id, "failed")
        _publish(stream_channel(job_id), {"type": "error", "message": str(e)})


def _publish(channel: str, payload: dict):
    try:
        _redis.publish(channel, json.dumps(payload))
    except Exception:
        _svc.logger.warning("[grammar_service] gagal publish ke Redis channel %s", channel)


def _run(job_id: str, request: dict, payload: dict):
    with _svc.timed_step("extract:text"):
        text = resolve_text(payload)
    if not text or not text.strip():
        raise ValueError("Teks kosong setelah ekstraksi")
    model = payload.get("model", "standard")
    if model not in ("standard", "advanced", "ai"):
        model = "standard"
    _svc.logger.info("[grammar_service] model=%s | job_id=%s", model, job_id)

    provider = provider_from_payload(payload) if model == "ai" else None
    language = payload.get("language") or GRAMMAR_LANGUAGE

    channel = stream_channel(job_id)

    def on_checkpoint(suggestions: list):
        _publish(channel, {"type": "checkpoint", "suggestions": suggestions})
    check_cancelled(job_id)
    with _svc.timed_step("grammar:analyze"):
        result = analyze_grammar(
            text, language=language, model=model,
            on_checkpoint=on_checkpoint, provider=provider,
        )
    update_tokens(job_id, result.get("total_tokens"))
    check_cancelled(job_id)
    save_metadata_version(
        request_id=request["request_id"],
        job_id=job_id,
        tab_id=request["tab_id"],
        user_id=request["user_id"],
        feature="grammar",
        result={
            "original_text": text,
            "corrected_text": result["corrected_text"],
            "suggestions": result["suggestions"],
            "scores": result["scores"],
            "writing_quality": result["writing_quality"],
            "quality_label": result["quality_label"],
        },
    )
    update_status(job_id, "completed")
    _publish(channel, {
        "type": "done",
        "original_text": text,
        "suggestions": result["suggestions"],
        "scores": result["scores"],
        "writing_quality": result["writing_quality"],
        "quality_label": result["quality_label"],
        "corrected_text": result["corrected_text"],
    })
