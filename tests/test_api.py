"""API smoke tests. They run against a temporary data directory (see conftest)."""
import hashlib

from fastapi.testclient import TestClient

from app import i18n
from app.config import CONFIG_PATH, hash_password, verify_password
from app.main import app

client = TestClient(app)


def reset_config() -> None:
    CONFIG_PATH.unlink(missing_ok=True)


def test_static_ui_is_served():
    assert client.get("/").status_code == 200
    assert "Intel AI Studio" in client.get("/").text
    assert "chat.new_title" in client.get("/i18n.js").text
    assert "applyI18n" in client.get("/app.js").text


def test_config_defaults_and_port_validation():
    reset_config()
    cfg = client.get("/api/config").json()
    assert cfg["ui_port"] == 8810
    r = client.post("/api/config", json={"rest_port": 99999})
    assert r.status_code == 400
    assert "65535" in r.json()["detail"]


def test_errors_are_localized():
    r = client.get("/api/ovms/versions?channel=bogus", headers={"Accept-Language": "en"})
    assert r.status_code == 400 and "stable" in r.json()["detail"]
    r = client.get("/api/ovms/versions?channel=bogus", headers={"Accept-Language": "ja"})
    assert r.status_code == 400 and "いずれか" in r.json()["detail"]


def test_chats_use_request_language():
    reset_config()
    r = client.post("/api/chats", headers={"Accept-Language": "ja"})
    assert r.status_code == 200 and r.json()["title"] == "新しいチャット"
    cid = r.json()["id"]
    assert client.get(f"/api/chats/{cid}").json()["params"]["max_tokens"] == 4096
    assert client.post("/api/chats", headers={"Accept-Language": "en"}).json()["title"] == "New chat"


def test_path_traversal_is_rejected():
    reset_config()
    assert client.delete("/api/ovms/runtime/..%5C..%5CWindows").status_code == 404
    assert client.delete("/api/models/..%5Cconfig.json").status_code == 404


def test_password_hashing_and_legacy_format():
    stored = hash_password("secret")
    assert stored.startswith("600000$")
    assert verify_password("secret", stored)
    assert not verify_password("wrong", stored)
    legacy = "0011223344556677$" + hashlib.pbkdf2_hmac(
        "sha256", b"pw", bytes.fromhex("0011223344556677"), 20000).hex()
    assert verify_password("pw", legacy)
    assert not verify_password("pw", "garbage")


def test_ov_ir_detection():
    from app.models import is_ov_ir
    assert is_ov_ir(["openvino_model.xml", "openvino_model.bin", "config.json"])
    assert is_ov_ir(["sub/model.xml", "sub/model.bin"])
    assert not is_ov_ir(["model.onnx", "config.json"])
    assert not is_ov_ir(["openvino_model.xml", "config.json"])
    assert not is_ov_ir([])


def test_search_endpoint(monkeypatch):
    reset_config()
    from app import models as modelsvc

    captured = {}

    def fake_search(query, limit=30, sort="downloads", token=None):
        captured.update(query=query, limit=limit, sort=sort)
        return [{"repo_id": "OpenVINO/test-ov", "downloads": 1, "likes": 0,
                 "last_modified": "2026-01-01T00:00:00.000Z", "gated": False,
                 "pipeline_tag": "text-generation", "library_name": "openvino", "files": 3}]

    monkeypatch.setattr(modelsvc, "search_hf_ir", fake_search)
    r = client.get("/api/models/search?q=qwen&sort=likes&limit=5")
    assert r.status_code == 200
    assert r.json()["results"][0]["repo_id"] == "OpenVINO/test-ov"
    assert captured == {"query": "qwen", "limit": 5, "sort": "likes"}

    r = client.get("/api/models/search")
    assert r.status_code == 400

    def boom(*_a, **_k):
        raise RuntimeError("boom")

    monkeypatch.setattr(modelsvc, "search_hf_ir", boom)
    r = client.get("/api/models/search?q=x", headers={"Accept-Language": "ja"})
    assert r.status_code == 502 and "モデル検索に失敗" in r.json()["detail"]


def test_i18n_fallback():
    assert i18n.tr("xx", "err.not_found") == "Not found"
    assert i18n.tr("ja", "err.not_found") == "見つかりません"
    assert i18n.tr("ja", "err.bad_port", key="ui_port") == "ui_port は 1〜65535 の整数で指定してください"


def test_login_session_and_rate_limit():
    reset_config()
    try:
        r = client.post("/api/config", json={"ui_auth_enabled": True,
                                             "ui_auth_user": "admin",
                                             "ui_auth_password": "hunter2"})
        assert r.status_code == 200
        assert client.get("/api/models").status_code == 401
        assert client.get("/api/auth/state").json() == {"enabled": True, "authenticated": False}

        assert client.post("/api/login", json={"user": "admin", "password": "nope"}).status_code == 401
        assert client.post("/api/login", json={"user": "admin", "password": "hunter2"}).status_code == 200
        assert client.get("/api/models").status_code == 200

        assert client.post("/api/logout").status_code == 200
        assert client.get("/api/models").status_code == 401

        codes = [client.post("/api/login", json={"user": "admin", "password": "x"}).status_code
                 for _ in range(6)]
        assert codes[:5] == [401] * 5
        assert codes[5] == 429
    finally:
        reset_config()
