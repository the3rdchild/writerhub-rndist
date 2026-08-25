"""
Penjaga regresi bahasa pada checker AI.

Akar masalah yang dijaga di sini: bahasa naskah sampai ke worker tapi berhenti
di pintu cabang AI - prompt-nya menyebut "English" secara harfiah, dan model
"memperbaiki" kata Indonesia jadi kata Inggris yang mirip bunyi (salah→salad,
mata→data, pada→Dada).
"""

from types import SimpleNamespace

from services.checker import analyze_grammar
from services.checker.ai_grammar import _SYSTEM, _system_prompt, check_ai_grammar


def _provider():
    return SimpleNamespace(
        model_id="model-x",
        alias=None,
        is_nine_router=False,
        base_url="http://provider.test",
        api_key="k",
        sdk_provider="openai",
    )


class _FakeResponse:
    def raise_for_status(self):
        pass

    def json(self):
        return {
            "choices": [{"message": {"content": '{"suggestions": []}'}}],
            "usage": {"total_tokens": 42},
        }


def test_prompt_indonesia_menyebut_bahasanya():
    prompt = _system_prompt("id")

    assert prompt.startswith("You are a professional grammar, spelling, and style checker for Indonesian text.")
    # Larangan mengoreksi ke bahasa lain adalah inti perbaikannya.
    assert "never against English" in prompt
    # Kontrak JSON-nya tidak berubah.
    assert '"suggestions"' in prompt
    assert '"offset"' in prompt


def test_prompt_inggris_dan_kosong_persis_seperti_semula():
    assert _system_prompt("en") is _SYSTEM
    assert _system_prompt(None) is _SYSTEM


def test_prompt_mengizinkan_passage_bahasa_lain_yang_disengaja():
    # Naskah nyata (paper) sering campur bahasa dengan sengaja - abstrak
    # Inggris di paper Indonesia tidak boleh ikut dipaksa jadi bahasa Indonesia.
    prompt = _system_prompt("id")

    assert "different language on purpose" in prompt
    assert "judge that passage by the grammar of the" in prompt
    # Larangan koreksi-fonetik berlaku dua arah, bukan cuma bahasa lain -> Inggris.
    assert "both directions" in prompt

    # Klausa yang sama juga berlaku untuk prompt default Inggris - dokumen
    # Inggris bisa saja punya kutipan/istilah bahasa lain yang sengaja.
    assert "different language on purpose" in _SYSTEM


def test_payload_llm_membawa_prompt_bahasa(monkeypatch):
    captured = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        captured["payload"] = json
        return _FakeResponse()

    monkeypatch.setattr("services.checker.ai_grammar.requests.post", fake_post)

    out, tokens = check_ai_grammar(
        "Naskah uji.",
        model_id="model-x",
        alias=None,
        is_nine_router=False,
        base_url="http://provider.test",
        api_key="k",
        sdk_provider="openai",
        language="id",
    )

    assert out == []
    assert tokens == 42
    system = captured["payload"]["messages"][0]["content"]
    assert "for Indonesian text" in system
    assert "English grammar, spelling" not in system


def test_bahasa_diteruskan_ke_checker_ai(monkeypatch):
    captured = {}

    def fake_ai(text, **kwargs):
        captured.update(kwargs)
        return [], None

    monkeypatch.setattr("services.checker.ai_grammar.check_ai_grammar", fake_ai)

    result = analyze_grammar("teks yang benar", language="id", model="ai", provider=_provider())

    assert captured["language"] == "id"
    # Fallback aturan-Inggris dilewati: 'teks' dan 'yang' akan diflag kamus
    # Inggris seandainya checker aturan jalan - kosong berarti ia tidak jalan.
    assert result["suggestions"] == []
    assert result["corrected_text"] == "teks yang benar"


def test_inggris_tetap_fallback_ke_checker_aturan(monkeypatch):
    monkeypatch.setattr(
        "services.checker.ai_grammar.check_ai_grammar",
        lambda text, **kwargs: ([], None),
    )

    result = analyze_grammar("She has speling errror.", language="en", model="ai", provider=_provider())

    # Kata yang memang salah-eja tetap tertangkap checker aturan.
    assert len(result["suggestions"]) >= 1
