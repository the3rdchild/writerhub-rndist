import logging
import json
from services.analysis_service import process

logger = logging.getLogger(__name__)


def handle(data: dict):
    """
    Handler yang dipanggil queue pas ada job analisis masuk.
    Tipis aja — print job dulu, terus lempar ke analysis_service.
    """
    logger.info("[analysis_worker] job diterima:")
    logger.info(json.dumps(data, indent=2, default=str))

    process(data)
