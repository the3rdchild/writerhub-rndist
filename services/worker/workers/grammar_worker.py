import logging
import json
from services.grammar_service import process

logger = logging.getLogger(__name__)


def handle(data: dict):
    """
    Handler yang dipanggil queue pas ada job masuk.
    Tipis aja - print job dulu, terus lempar ke grammar_service.
    """
    logger.info("[grammar_worker] job diterima:")
    logger.info(json.dumps(data, indent=2, default=str))

    process(data)
