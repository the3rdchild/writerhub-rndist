"""
Uji untuk analyzer glosarium (§P2, B-6).

Hanya menguji `extract_candidates` - bagian murni tanpa LLM yang membaca seluruh
naskah. Inilah yang memutuskan apa yang masuk daftar dan sebagai jenis apa, jadi
perilakunya wajib stabil dan terverifikasi terpisah dari panggilan model.

Jalankan di lingkungan worker (deps terpasang), mis. lewat pytest:
    cd services/worker && python -m pytest services/analyzers/test_glossary.py
"""

from services.analyzers.glossary import extract_candidates


def by_term(candidates):
    return {term: (count, kind) for term, count, kind in candidates}


def test_akronim_diterima_walau_hanya_sekali_dengan_kind_acronym():
    candidates = extract_candidates("The DCS regulates the flow.")
    kinds = by_term(candidates)
    assert "DCS" in kinds
    assert kinds["DCS"] == (1, "acronym")


def test_frasa_berkapital_harus_berulang_dengan_kind_phrase():
    once = extract_candidates("Important Concept appeared here once.")
    assert "Important Concept" not in by_term(once)

    repeated = extract_candidates(
        "Important Concept is key. We use Important Concept everywhere. "
        "Important Concept matters."
    )
    kinds = by_term(repeated)
    assert "Important Concept" in kinds
    assert kinds["Important Concept"][1] == "phrase"
    assert kinds["Important Concept"][0] >= 3


def test_akronim_berlapis_tidak_dihitung_sebagai_frasa():
    candidates = extract_candidates("GPT4 and GPT4 again.")
    kinds = by_term(candidates)
    assert kinds["GPT4"][1] == "acronym"


def test_hasil_diurutkan_terbanyak_dulu():
    candidates = extract_candidates(
        "Rare Once. Repeated Thing here. Repeated Thing there. AAA AAA AAA."
    )
    kinds = by_term(candidates)
    order = [term for term, _, _ in candidates]
    assert order.index("AAA") < order.index("Repeated Thing")
