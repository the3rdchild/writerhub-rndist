"""
Uji titik periksa pembatalan kooperatif (§P7 lapis C, B-9).

Tidak butuh Redis sungguhan: modul membaca `_redis` miliknya, jadi kita
menyuntik pengganti in-memory. Yang diuji adalah logika titik periksa, bukan
klien Redis - itu urusannya pustaka.
"""

import pytest

from core import cancel


class _FakeRedis:
    """Hanya menyimulasikan EXISTS dan DEL pada sebuah himpunan key."""

    def __init__(self) -> None:
        self.flags: set[str] = set()

    def exists(self, key: str) -> int:
        return 1 if key in self.flags else 0

    def delete(self, key: str) -> int:
        self.flags.discard(key)
        return 1


@pytest.fixture(autouse=True)
def _fake_redis(monkeypatch):
    fake = _FakeRedis()
    monkeypatch.setattr(cancel, "_redis", fake)
    return fake


def test_titik_periksa_tidak_melempar_saat_bendera_mati(_fake_redis):
    # Tidak ada bendera → job dianggap masih berjalan, tidak ada pengecualian.
    cancel.check_cancelled("job-1")


def test_titik_periksa_melempar_cancelled_error_saat_bendera_menyala(_fake_redis):
    _fake_redis.flags.add("job:job-2:cancel")
    with pytest.raises(cancel.CancelledError):
        cancel.check_cancelled("job-2")


def test_is_cancelled_membaca_key_yang_benar(_fake_redis):
    assert cancel.is_cancelled("job-3") is False
    _fake_redis.flags.add("job:job-3:cancel")
    assert cancel.is_cancelled("job-3") is True


def test_clear_flag_membuang_bendera(_fake_redis):
    _fake_redis.flags.add("job:job-4:cancel")
    cancel.clear_flag("job-4")
    assert cancel.is_cancelled("job-4") is False
