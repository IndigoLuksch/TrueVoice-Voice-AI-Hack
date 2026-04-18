import pytest


def test_settings_loads_from_env(monkeypatch):
    monkeypatch.setenv("SPEECHMATICS_API_KEY", "sm-test")
    monkeypatch.setenv("THYMIA_API_KEY", "th-test")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "an-test")
    from app.config import Settings

    s = Settings(_env_file=None)
    assert s.speechmatics_api_key.get_secret_value() == "sm-test"
    assert s.thymia_api_key.get_secret_value() == "th-test"
    assert s.anthropic_api_key.get_secret_value() == "an-test"
    assert s.allowed_origins == ["http://localhost:3000"]


def test_allowed_origins_csv(monkeypatch):
    monkeypatch.setenv("SPEECHMATICS_API_KEY", "x")
    monkeypatch.setenv("THYMIA_API_KEY", "x")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "x")
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:3000,https://example.com")
    from app.config import Settings

    s = Settings(_env_file=None)
    assert s.allowed_origins == ["http://localhost:3000", "https://example.com"]


def test_missing_key_fails_loud(monkeypatch):
    monkeypatch.delenv("SPEECHMATICS_API_KEY", raising=False)
    monkeypatch.delenv("THYMIA_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    from app.config import Settings

    with pytest.raises(Exception):
        Settings(_env_file=None)


def test_mask_key_short_secret():
    from app.config import mask_key
    out = mask_key("sm-verysecretvalue")
    assert out.startswith("sm-")
    assert "verysecretvalue" not in out
    assert "len=" in out


def test_mask_key_empty():
    from app.config import mask_key
    assert mask_key("") == "<empty>"


def test_settings_repr_does_not_leak_secret(monkeypatch):
    monkeypatch.setenv("SPEECHMATICS_API_KEY", "sm-shouldnotappear")
    monkeypatch.setenv("THYMIA_API_KEY", "th-alsohidden")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "an-hidden")
    from app.config import Settings

    s = Settings(_env_file=None)
    r = repr(s)
    assert "shouldnotappear" not in r
    assert "alsohidden" not in r
    assert "hidden" not in r


def test_log_key_presence_returns_masked_entries(monkeypatch):
    monkeypatch.setenv("SPEECHMATICS_API_KEY", "sm-abcdefghij")
    monkeypatch.setenv("THYMIA_API_KEY", "th-klmnopqrst")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "an-uvwxyzabcd")
    from app.config import Settings, log_key_presence

    s = Settings(_env_file=None)
    out = log_key_presence(s)
    assert set(out.keys()) == {"SPEECHMATICS_API_KEY", "THYMIA_API_KEY", "ANTHROPIC_API_KEY"}
    for v in out.values():
        assert "abcdefghij" not in v and "klmnopqrst" not in v and "uvwxyzabcd" not in v
        assert "len=" in v
