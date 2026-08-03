"""
Provider LLM yang dipakai worker.

Sumber utamanya adalah payload job — apps/api meresolvenya dari admin-ppe
(/api/info) per user. Pada pengembangan lokal apps/api berjalan tanpa
admin-ppe, jadi payload tidak membawa provider dan worker jatuh ke konfigurasi
AI_* di env-nya sendiri.
"""

from typing import NamedTuple

from core.configs.env import AI_API_KEY, AI_BASE_URL, AI_MODEL


class Provider(NamedTuple):
    model_id: str | None
    alias: str | None
    is_nine_router: bool
    base_url: str
    api_key: str
    sdk_provider: str

    @property
    def model(self) -> str | None:
        """Nine Router pakai alias sebagai model id, selain itu pakai modelId."""
        return self.alias if self.is_nine_router else self.model_id

    def validate(self) -> None:
        if self.sdk_provider != "openai":
            raise ValueError(
                f"sdk_provider '{self.sdk_provider}' belum didukung worker ini (cuma OpenAI-compatible)."
            )
        if not self.model:
            raise ValueError("Model tidak tersedia dari provider config.")
        if not self.base_url or not self.api_key:
            raise ValueError("baseUrl/apiKey tidak tersedia dari provider config.")


def _from_env() -> Provider | None:
    """Provider cadangan dari env — dipakai saat berjalan tanpa admin-ppe."""
    if not AI_API_KEY or not AI_BASE_URL:
        return None

    return Provider(
        model_id=AI_MODEL,
        alias=None,
        is_nine_router=False,
        base_url=AI_BASE_URL,
        api_key=AI_API_KEY,
        sdk_provider="openai",
    )


def provider_from_payload(payload: dict) -> Provider:
    """Provider dari payload job; melempar kalau tidak ada satu pun sumber."""
    provider = resolve_provider(payload)
    if provider is None:
        raise ValueError(
            "Tidak ada provider LLM. Job tidak membawa konfigurasi dari admin-ppe dan "
            "AI_API_KEY/AI_BASE_URL belum diisi di env worker."
        )
    return provider


def resolve_provider(payload: dict) -> Provider | None:
    """
    Sama seperti `provider_from_payload`, tapi mengembalikan None alih-alih
    melempar. Dipakai jalur yang tidak selalu butuh LLM — analyzer plagiarism
    misalnya, yang murni heuristik.
    """
    if payload.get("baseUrl") and payload.get("apiKey"):
        provider = Provider(
            model_id=payload.get("modelId"),
            alias=payload.get("alias"),
            is_nine_router=bool(payload.get("isNineRouter")),
            base_url=payload.get("baseUrl") or "",
            api_key=payload.get("apiKey") or "",
            sdk_provider=payload.get("sdkProvider") or "",
        )
        provider.validate()
        return provider

    fallback = _from_env()
    if fallback is not None:
        fallback.validate()
    return fallback
