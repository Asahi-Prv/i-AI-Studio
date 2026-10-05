"""Small message catalog for backend-facing strings (English / Japanese).

The UI sends its current language via the ``Accept-Language`` header. Background
workers remember the language of the request that started them through
``tasks`` so that progress messages stay consistent.
"""
from __future__ import annotations

DEFAULT_LANG = "en"
LANGS = ("en", "ja")

MESSAGES: dict[str, dict[str, str]] = {
    "en": {
        # generic
        "task.preparing": "Preparing...",
        "task.done": "Done",
        "task.failed": "Failed",
        "task.downloading": "Downloading...",
        "task.hf_downloading": "Downloading {repo}...",
        "task.done_name": "Done: {name}",
        "task.extracting": "Extracting...",
        "task.verifying": "Verifying SHA256...",
        "task.install_done": "Installed: {label}",
        "task.ovms_install": "Install OVMS: {label}",
        "task.hf_download": "HF: {repo}",
        "task.url_download": "URL: {url}",
        # chats
        "chat.new_title": "New chat",
        "chat.untitled": "Untitled",
        # auth
        "auth.disabled": "Authentication is disabled",
        "auth.bad_credentials": "Invalid username or password",
        "auth.too_many_attempts": "Too many login attempts. Please try again later.",
        # errors
        "err.bad_channel": "channel must be 'stable' or 'weekly'",
        "err.versions_failed": "Failed to fetch the version list: {error}",
        "err.url_not_allowed": "URL is not allowed",
        "err.no_versions": "No matching version found",
        "err.runtime_not_found": "The selected runtime was not found",
        "err.not_found": "Not found",
        "err.bad_repo_id": "repo_id must be in 'org/name' format",
        "err.bad_url": "URL must start with http:// or https://",
        "err.search_query_required": "Enter a search query",
        "err.search_failed": "Model search failed: {error}",
        "err.model_not_found": "Model not found",
        "err.model_not_found_id": "Model '{name}' not found",
        "err.no_model_selected": "No model selected",
        "err.no_runtime": "No OVMS runtime installed. Install one from the Settings tab.",
        "err.bad_mode": "mode must be one of: {allowed}",
        "err.bad_option_value": "{key} must be one of: {allowed} (empty = model default)",
        "err.bad_option_number": "{key} must be a number",
        "err.bad_port": "{key} must be an integer between 1 and 65535",
        "err.ovms_not_running": "OVMS is not running",
        "err.bad_chat_id": "Invalid chat id",
        "err.chat_not_found": "Chat not found",
        "err.cancelled": "Cancelled",
        "err.sha_mismatch": "SHA256 mismatch (the download may be corrupted)",
        "err.exe_not_found": "{exe} was not found in the package",
        "err.weekly_structure": "Unexpected 'weekly' package listing structure",
        "err.runtime_not_found_id": "Runtime '{runtime_id}' not found",
        "err.runtime_exe_missing": "Runtime '{runtime_id}' does not contain {exe}",
        "err.already_running": "Already running. Stop it first.",
        "err.unsafe_archive": "Archive contains an unsafe path",
        "err.load_timeout": "Model load timed out (300 s)",
        "err.ovms_exited": "ovms exited (code {code}). Check the logs in the Settings tab.",
        "err.delete_failed": "Failed to delete {path} (it may be in use by another process)",
        # runtime log lines
        "log.flag_unsupported": "Skipping {flag}: not supported by this build",
        "log.api_key_enabled": "API_KEY auth enabled (external clients need a Bearer key)",
    },
    "ja": {
        # generic
        "task.preparing": "準備中...",
        "task.done": "完了",
        "task.failed": "失敗",
        "task.downloading": "ダウンロード中...",
        "task.hf_downloading": "{repo} をダウンロード中...",
        "task.done_name": "完了: {name}",
        "task.extracting": "展開中...",
        "task.verifying": "SHA256 検証中...",
        "task.install_done": "インストール完了: {label}",
        "task.ovms_install": "OVMS インストール: {label}",
        "task.hf_download": "HF: {repo}",
        "task.url_download": "URL: {url}",
        # chats
        "chat.new_title": "新しいチャット",
        "chat.untitled": "無題",
        # auth
        "auth.disabled": "認証は無効です",
        "auth.bad_credentials": "ユーザー名またはパスワードが違います",
        "auth.too_many_attempts": "ログイン試行が多すぎます。しばらくしてから再試行してください",
        # errors
        "err.bad_channel": "channel は stable / weekly のいずれかです",
        "err.versions_failed": "バージョン一覧の取得に失敗しました: {error}",
        "err.url_not_allowed": "許可されていないURLです",
        "err.no_versions": "対象バージョンが見つかりませんでした",
        "err.runtime_not_found": "指定されたランタイムが見つかりません",
        "err.not_found": "見つかりません",
        "err.bad_repo_id": "repo_id を 'org/name' 形式で指定してください",
        "err.bad_url": "http(s) のURLを指定してください",
        "err.search_query_required": "検索キーワードを入力してください",
        "err.search_failed": "モデル検索に失敗しました: {error}",
        "err.model_not_found": "モデルが見つかりません",
        "err.model_not_found_id": "モデル '{name}' が見つかりません",
        "err.no_model_selected": "モデルが選択されていません",
        "err.no_runtime": "OVMSランタイムがありません。「設定」タブでインストールしてください",
        "err.bad_mode": "mode は {allowed} のいずれかです",
        "err.bad_option_value": "{key} は {allowed} のいずれかです（空欄=モデル既定）",
        "err.bad_option_number": "{key} は数値で指定してください",
        "err.bad_port": "{key} は 1〜65535 の整数で指定してください",
        "err.ovms_not_running": "OVMS が起動していません",
        "err.bad_chat_id": "不正なIDです",
        "err.chat_not_found": "チャットが見つかりません",
        "err.cancelled": "キャンセルされました",
        "err.sha_mismatch": "SHA256 が一致しません（ダウンロード破損の可能性）",
        "err.exe_not_found": "パッケージ内に {exe} が見つかりません",
        "err.weekly_structure": "weekly packages の一覧構造が変わったようです",
        "err.runtime_not_found_id": "ランタイム '{runtime_id}' が見つかりません",
        "err.runtime_exe_missing": "ランタイム '{runtime_id}' に {exe} がありません",
        "err.already_running": "すでに起動しています。先に停止してください。",
        "err.unsafe_archive": "アーカイブに安全でないパスが含まれています",
        "err.load_timeout": "ロードがタイムアウトしました（300秒）",
        "err.ovms_exited": "ovms が終了しました (code {code})。設定タブのログを確認してください。",
        "err.delete_failed": "削除に失敗しました（他のプロセスが使用中かもしれません）: {path}",
        # runtime log lines
        "log.flag_unsupported": "このビルドは {flag} をサポートしていないため省略します",
        "log.api_key_enabled": "API_KEY 認証を有効化しました（外部利用には Bearer キーが必要）",
    },
}


def normalize(lang: str | None) -> str:
    """Map an Accept-Language-ish value to a supported language code."""
    if lang and lang.strip().lower().startswith("ja"):
        return "ja"
    return DEFAULT_LANG


def tr(lang: str | None, msg_key: str, **fmt) -> str:
    """Translate ``msg_key`` into ``lang``, falling back to English, then the key."""
    table = MESSAGES.get(normalize(lang), MESSAGES[DEFAULT_LANG])
    template = table.get(msg_key) or MESSAGES[DEFAULT_LANG].get(msg_key) or msg_key
    try:
        return template.format(**fmt)
    except (KeyError, IndexError, ValueError):
        return template
