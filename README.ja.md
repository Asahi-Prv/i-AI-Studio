# Intel AI Studio

[English README is here](README.md)

> [!IMPORTANT]
> 本プロジェクトは個人が開発した非公式のコミュニティプロジェクトです。**Intel Corporation
> との提携・承認・スポンサー関係はありません**。「Intel」「OpenVINO」は Intel Corporation の
> 商標であり、本プロジェクトでは互換性の説明のためにのみ使用しています。Intel の公式製品では
> ありません。

[OpenVINO Model Server (OVMS)](https://github.com/openvinotoolkit/model_server) をブラウザから
管理するローカルWeb UIです。ランタイムの導入からモデルのダウンロード、ロード、チャットまでを
一通り操作できます。

- **OVMSランタイムのインストール** — Stable（GitHubリリース）/ Weekly、`python_on` 版のみ。
  可能な場合は SHA-256 を検証。
- **モデルのダウンロード** — Hugging Face（トークン使用のゲート付きモデル対応）または任意の
  直リンク（zip/tar は自動展開）。ダウンロードはタスクパネルからキャンセルできます。
- **モデル検索** — Hugging Face 上の **OpenVINO IR** モデル（`.xml` + `.bin` のペアを含む
  リポジトリ）のみを検索。結果は無限スクロールでページング読み込みされ、ダウンロードでは
  IR 以外の重み（PyTorch / ONNX 等）を除外して容量を節約できます。
- **モデルのロード / アンロード** — デバイス選択（CPU/GPU/NPU/AUTO）、サーブモード自動判定、
  KVキャッシュ容量・精度（u8）・コンテキスト長・prefixキャッシュなどのLLMロード設定。
- **チャット** — ストリーミング応答、Markdownレンダリング、思考（reasoning）表示、タイトル
  自動生成、チャットごとの生成パラメータ、履歴の保存。
- **画像生成** — `image_generation` モデルに対応。
- **API提供** — OVMS自身がOpenAI互換REST / gRPCを提供。外部クライアント向けの Bearer
  APIキーもUIから設定可能。
- **アップデート** — パッケージ版は起動時にGitHub Releasesを確認（1日1回まで）。ワンクリックで
  ダウンロード→SHA-256検証→自動で入れ替え・再起動（モデルやチャットは保持）。
- **日英UI** — 実行中にワンクリックで切り替え。

## 動作要件

- Windows 10/11 (x64) または Ubuntu 24.04（OVMS `python_on` パッケージに準拠）
- ソースから実行する場合は Python 3.12 以上（配布exeはPython同梱）
- ディスク容量: OVMSランタイム 約1〜2GB + モデルサイズ

## クイックスタート（ソースから）

Windows:

```bat
git clone https://github.com/Asahi-Prv/i-AI-Studio.git
cd intel-ai-studio
run.bat
```

Linux / 手動:

```bash
git clone https://github.com/Asahi-Prv/i-AI-Studio.git
cd intel-ai-studio
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m app.main
```

`http://127.0.0.1:8810` で起動し、ブラウザが自動で開きます。

## はじめの手順

1. **ランタイムをインストール** — 「初期セットアップ」カードの「おすすめ（最新Stable）を
   インストール」、または「設定」タブで Stable / Weekly を選んで一覧取得→インストール。
2. **モデルをダウンロード** — 「モデル管理」タブで Hugging Face のリポジトリID
   （例: `OpenVINO/Qwen3-8B-int4-ov`）または直リンクURLを指定。
3. **ロード** — ロードダイアログでデバイスと（必要なら）サーブモードを選び「ロード」。
   OVMS がモデルを `AVAILABLE` と報告するまで待機します。
4. **チャット** — 右サイドバーにチャット専用の生成パラメータ（temperature、top-p/k、
   max_tokens、systemプロンプト、思考制御）があります。

## 単体実行ファイルのビルド

```bat
build.bat
```

`dist\Intel-AI-Studio\Intel-AI-Studio.exe`（Python同梱のポータブルフォルダ）が生成されます。
出荷前にスモークテストで起動確認できます:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\smoke-test.ps1
```

データはexeと同じフォルダの `data` に保存されます。配布するときは `dist\Intel-AI-Studio`
フォルダごとzipにしてください。ユーザーは展開してexeを実行するだけです。署名がないため
WindowsのSmartScreen警告が出る場合があります（*詳細情報 → 実行*）。

ビルド設定は `intel_ai_studio.spec`（datas・windowed・UPXなし）にあります。CIも同じspecで
`v*` タグをビルドし、exeの起動確認後にzipをGitHubリリースへ添付します
（`.github/workflows/build.yml`）。

## 他アプリからモデルAPIを利用する

外部アプリはOVMS本体へ直接接続してください（UIの `/proxy/*` は自ページ用のCORS回避です）:

| インターフェース | エンドポイント |
| --- | --- |
| Chat completions（OpenAI互換） | `POST http://<host>:8000/v3/chat/completions` |
| Embeddings | `POST http://<host>:8000/v3/embeddings` |
| Rerank | `POST http://<host>:8000/v3/rerank` |
| 音声合成 / 認識 | `POST http://<host>:8000/v3/audio/speech`, `/v3/audio/transcriptions` |
| Classic IR/ONNX | KServe / TFS API 例: `POST http://<host>:8000/v2/models/<名>/infer` |
| gRPC | ポート `9000` |

「設定」で OVMS APIキーを設定した場合、クライアントは
`Authorization: Bearer <キー>` を送る必要があります。

## 外部公開と認証

既定では `127.0.0.1` にのみバインドされ、ローカル端末からのみ利用できます。

外部公開する場合:

1. **設定 → 詳細設定** でバインドアドレスを `0.0.0.0` に変更。
2. **設定 → 外部公開・認証** で管理UIのログインを有効化（パスワードは
   PBKDF2-HMAC-SHA256 ハッシュで保存、セッションCookieは7日間）し、必要に応じて
   OVMS APIキーも設定。
3. HTTPS化はリバースプロキシ（Caddy / nginx 等）で行ってください。本アプリ自体はTLSを
   終端しません。

ログイン試行はプロセス内でレート制限されます（同一クライアント5回/5分）。

## 設定とデータ保存先

- ソース実行: `<プロジェクト>/data/`
- 配布exe: `<exeのあるフォルダ>/data/`
- 環境変数 `AI_STUDIO_DATA` で変更可能。

| パス | 内容 |
| --- | --- |
| `config.json` | UI/OVMS設定、選択状態、シークレット（HFトークン、OVMS APIキー） |
| `load_presets.json` | モデルごとのロード設定 |
| `models/` | ダウンロード済みモデル（1モデル1フォルダ） |
| `runtimes/` | インストール済みOVMSランタイム |
| `chats/` | チャット履歴（JSON） |
| `app.log` | windowedビルド用ログ |

> HFトークンとOVMS APIキーは `config.json` に**平文**で保存されます（UIパスワードは
> ハッシュ化）。データフォルダの管理に注意してください。

## セキュリティ上の注意

- バインドアドレスと認証を変更するまで、管理UIはローカル専用です。
- ランタイムのダウンロード先は公式のGitHubリリース / OpenVINOストレージURLに制限され、
  公開されているSHA-256を検証します。アーカイブ展開はパストラバーサルを拒否します。
- UIプロキシはOVMS APIキーをサーバー側で付与するため、ブラウザにキーが渡りません。
- モデル/ランタイムの削除はデータフォルダ内に限定されています。

## トラブルシューティング

- **モデルのロードに失敗する** — 「設定 → ログ」を確認。LLMのメモリ不足はKVキャッシュ縮小、
  `u8` KV精度、コンテキスト長短縮で改善することが多いです（ロードダイアログの「推奨値を
  自動入力」は空きRAMから算出します）。
- **`max_prompt_len` が無視される** — NPU専用オプションです。CPU/GPUではエラーになるため
  自動的に省略します。
- **OneDriveフォルダでビルドが失敗する** — `build.bat` は `%TEMP%` でビルドして `dist\` に
  コピーするため、OneDriveの同期ロックを回避します。
- **Weekly で一覧構造エラーが出る** — 上流のファイル一覧構造が変わっています。Issueで
  報告してください。

## プロジェクト構成

```
ai_studio.py          エントリポイント（PyInstallerでも使用）
intel_ai_studio.spec  PyInstallerビルド設定（onedir・windowed）
app/
  main.py             FastAPIルート、セッション認証、OVMSプロキシ、静的配信
  ovms.py             ランタイム検出/インストール、プロセス制御
  models.py           Hugging Face / URLダウンロード・検索、モデル管理
  chats.py            チャット履歴の永続化
  config.py           パス・設定・パスワードハッシュ
  i18n.py             バックエンドメッセージカタログ（en/ja）
  tasks.py            バックグラウンドタスク管理
  fsutil.py           ファイル操作ヘルパー（安全な削除・パス検証）
  static/             SPA: index.html, app.js, i18n.js, style.css
scripts/              補助スクリプト（ビルド済みexeのスモークテスト）
tests/                バックエンドAPIテスト（pytest）
.github/              ワークフローとIssue/PRテンプレート
```

## 開発

```bash
pip install -r requirements-dev.txt
ruff check .
python -m compileall -q app ai_studio.py
```

プルリクエストではCIで同じチェックが実行されます。Windows exeは *Build Windows app*
ワークフロー（`v*` タグまたは手動実行）でビルドされます。

## コントリビュート

コントリビュート歓迎です。開発環境・コーディング規約・ローカライズ・PRの流れは
[CONTRIBUTING.ja.md](CONTRIBUTING.ja.md)（英語版: [CONTRIBUTING.md](CONTRIBUTING.md)）を
参照してください。

- バグ報告・機能リクエストはIssueフォームからお願いします。
- セキュリティ問題は [SECURITY.md](SECURITY.md) の手順で非公開で報告してください。
- リリース履歴は [CHANGELOG.md](CHANGELOG.md) を参照してください。

## ライセンス

[MIT](LICENSE) © 2026 Asahi

Intel および OpenVINO は Intel Corporation の商標です。本プロジェクトは Intel Corporation
との提携・承認・スポンサー関係はありません。
