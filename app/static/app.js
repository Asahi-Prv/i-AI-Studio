"use strict";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

const DEFAULT_PARAMS = { temperature: 0.7, top_p: 0.95, top_k: 40, max_tokens: 4096,
                         repetition_penalty: 1.0, system_prompt: "", suppress_thinking: false };

const state = {
  cfg: {},
  versions: [],
  installed: [],
  models: [],
  status: {},
  tasks: [],
  chats: [],        // session meta list
  chat: null,       // current chat object {id,title,messages,params,...}
  hfSearch: [],     // Hugging Face search results (OpenVINO IR only)
  hfSearchNext: null,
  hfSearchQuery: "",
  devices: [],        // last known device list for the selected runtime
  update: null,       // last update-check result
  _updateTaskId: null,
  sending: false,
  abort: null,      // AbortController while streaming
  stickBottom: true,        // chat autoscroll follows new output while true
  _statusSig: "",           // last rendered server status (skip DOM work when unchanged)
  _modelSelectSig: "",
  _taskEls: new Map(),      // task id -> cached DOM refs
  _titleTimer: null,        // pending auto-title generation
};

// ------------------------------------------------------------ helpers

async function api(path, opts = {}) {
  const headers = { "Accept-Language": LANG, ...(opts.headers || {}) };
  const o = { ...opts, headers };
  if (o.body !== undefined && typeof o.body !== "string") {
    headers["Content-Type"] = "application/json";
    o.body = JSON.stringify(o.body);
  }
  const r = await fetch(path, o);
  if (!r.ok) {
    if (r.status === 401 && !path.startsWith("/api/login")) {
      showLogin();
      throw new Error(t("auth.login_required"));
    }
    let msg = `${r.status} ${r.statusText}`;
    try { msg = (await r.json()).detail || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return r.json();
}

// ------------------------------------------------------------ language switch

const langBtn = $("#btnLang");
if (langBtn) {
  langBtn.textContent = LANG === "ja" ? "English" : "日本語";
  langBtn.addEventListener("click", () => setLang(LANG === "ja" ? "en" : "ja"));
}

// ------------------------------------------------------------ auth (login overlay)

function showLogin() {
  $("#loginOverlay").classList.remove("hidden");
  $("#loginErr").textContent = "";
  setTimeout(() => $("#loginUser").focus(), 50);
}
function hideLogin() { $("#loginOverlay").classList.add("hidden"); }

async function doLogin() {
  const btn = $("#btnLogin");
  btn.disabled = true;
  $("#loginErr").textContent = "";
  try {
    await api("/api/login", { method: "POST", body: {
      user: $("#loginUser").value, password: $("#loginPass").value,
    }});
    hideLogin();
    $("#loginPass").value = "";
    boot();
  } catch (e) {
    $("#loginErr").textContent = e.message;
  } finally {
    btn.disabled = false;
  }
}
$("#btnLogin").addEventListener("click", doLogin);
$("#loginPass").addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });

$("#btnLogout").addEventListener("click", async () => {
  try { await api("/api/logout", { method: "POST" }); } catch { /* ignore */ }
  location.reload();
});

// ------------------------------------------------------------ modal dialog

function confirmDlg(message, okLabel) {
  return new Promise(resolve => {
    const ov = $("#modalOverlay");
    $("#modalMsg").textContent = message;
    $("#modalOk").textContent = okLabel || t("common.delete");
    ov.classList.remove("hidden");
    const done = v => {
      ov.classList.add("hidden");
      $("#modalOk").onclick = $("#modalCancel").onclick = null;
      resolve(v);
    };
    $("#modalOk").onclick = () => done(true);
    $("#modalCancel").onclick = () => done(false);
  });
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtBytes(n) {
  if (!n || n <= 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
}

let toastTimer = null;
function toast(msg, isErr = false) {
  const tEl = $("#toast");
  tEl.textContent = msg;
  tEl.className = isErr ? "err" : "";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => tEl.classList.add("hidden"), 4000);
}

function channel() {
  return (document.querySelector('input[name="channel"]:checked') || {}).value || "stable";
}

// ------------------------------------------------------------ paint scheduling

let _rafId = 0;
let _rafFn = null;
function scheduleFrame(fn) {
  _rafFn = fn;  // coalesce multiple updates into one frame
  if (_rafId) return;
  _rafId = requestAnimationFrame(() => {
    _rafId = 0;
    const pending = _rafFn;
    _rafFn = null;
    if (pending) pending();
  });
}

function chatNearBottom(log) {
  return (log.scrollHeight - log.scrollTop - log.clientHeight) < 120;
}

$("#chatLog").addEventListener("scroll", () => {
  state.stickBottom = chatNearBottom($("#chatLog"));
}, { passive: true });

// ------------------------------------------------------------ views

$$(".tabbtn").forEach(b => b.addEventListener("click", () => {
  if (!b.dataset.view) return;  // buttons without a view (quit, language) do nothing here
  showView(b.dataset.view);
}));

function showView(v) {
  $$(".tabbtn").forEach(x => x.classList.toggle("active", x.dataset.view === v));
  $$(".view").forEach(x => x.classList.toggle("active", x.id === "view-" + v));
  if (v === "models") loadModels();
  if (v === "settings") {
    loadInstalled(); loadLogs();
    if (state.versionsChannel !== channel()) fetchVersions();
  }
}

// ------------------------------------------------------------ config

function secretField(sel, isSet, placeholder) {
  const el = $(sel);
  el.value = "";
  el.dataset.forceClear = "";
  el.placeholder = isSet ? t("settings.secret_set_placeholder") : placeholder;
}

async function loadConfig() {
  state.cfg = await api("/api/config");
  $("#btnLogout").classList.toggle("hidden", !state.cfg.ui_auth_enabled);
  $("#cfgBind").value = state.cfg.bind_address || "127.0.0.1";
  secretField("#cfgToken", state.cfg.hf_token_set, t("settings.hf_token_placeholder"));
  secretField("#cfgOvmsKey", state.cfg.ovms_api_key_set, "API_KEY");
  $("#chkUiAuth").checked = !!state.cfg.ui_auth_enabled;
  $("#cfgUser").value = state.cfg.ui_auth_user || "";
  $("#cfgPassword").value = "";
  $("#cfgPassword").placeholder = state.cfg.ui_auth_password_set
    ? t("settings.secret_set_placeholder") : t("settings.password_placeholder");
  $("#cfgRest").value = state.cfg.rest_port || 8000;
  $("#cfgGrpc").value = state.cfg.grpc_port || 9000;
  $("#cfgExtra").value = state.cfg.extra_args || "";
  $("#cfgVersion").textContent = state.cfg.app_version || "-";
  $("#updCurrent").textContent = state.cfg.app_version || "-";
  $("#chkUpdateCheck").checked = state.cfg.update_check_enabled !== false;
  $("#cfgDataDir").textContent = state.cfg.data_dir || "-";
  $("#cfgModelsDir").textContent = state.cfg.models_dir || "-";
}

$("#btnClearToken").addEventListener("click", () => {
  $("#cfgToken").value = ""; $("#cfgToken").dataset.forceClear = "1";
  toast(t("settings.hf_cleared"));
});
$("#btnClearOvmsKey").addEventListener("click", () => {
  $("#cfgOvmsKey").value = ""; $("#cfgOvmsKey").dataset.forceClear = "1";
  toast(t("settings.key_cleared"));
});

$("#btnCfgSave").addEventListener("click", async () => {
  const body = {
    bind_address: $("#cfgBind").value.trim() || "127.0.0.1",
    rest_port: Number($("#cfgRest").value) || 8000,
    grpc_port: Number($("#cfgGrpc").value) || 9000,
    extra_args: $("#cfgExtra").value,
    ui_auth_enabled: $("#chkUiAuth").checked,
    ui_auth_user: $("#cfgUser").value.trim(),
  };
  // secrets: send only when changed (or explicitly cleared)
  const tok = $("#cfgToken"), key = $("#cfgOvmsKey"), pw = $("#cfgPassword").value;
  if (tok.value.trim() || tok.dataset.forceClear) body.hf_token = tok.value.trim();
  if (key.value.trim() || key.dataset.forceClear) body.ovms_api_key = key.value.trim();
  if (pw) body.ui_auth_password = pw;
  if (body.ui_auth_enabled && (!body.ui_auth_user || (!pw && !state.cfg.ui_auth_password_set))) {
    toast(t("settings.auth_needed"), true);
    return;
  }
  try {
    const wasOff = !state.cfg.ui_auth_enabled;
    state.cfg = await api("/api/config", { method: "POST", body });
    $("#cfgSaved").textContent = t("settings.saved");
    setTimeout(() => { $("#cfgSaved").textContent = ""; }, 3000);
    loadConfig();
    if (wasOff && body.ui_auth_enabled) {
      toast(t("settings.auth_enabled"));
      showLogin();  // immediate verification
    }
  } catch (e) { toast(e.message, true); }
});

// ------------------------------------------------------------ self-update

async function loadUpdate(force = false) {
  const status = $("#updStatus");
  $("#btnUpdateCheck").disabled = true;
  status.textContent = t("settings.update_checking");
  try {
    state.update = await api(`/api/update/check?force=${force ? 1 : 0}`);
    renderUpdate();
  } catch (e) {
    state.update = null;
    status.textContent = t("settings.update_failed", { msg: e.message });
  } finally {
    $("#btnUpdateCheck").disabled = false;
  }
}

function renderUpdate() {
  const info = state.update;
  if (!info) return;
  $("#updCurrent").textContent = info.current || "-";
  const dot = $("#settingsDot");
  const runBtn = $("#btnUpdateRun");
  const link = $("#updReleaseLink");
  const status = $("#updStatus");
  const sourceNote = info.frozen ? "" : ` / ${t("settings.update_source_note")}`;
  if (info.available) {
    status.textContent = t("settings.update_available", { v: info.latest }) + sourceNote;
    runBtn.textContent = t("settings.update_btn", { v: info.latest });
    runBtn.classList.toggle("hidden", !info.frozen);
    if (info.html_url) link.href = info.html_url;
    link.classList.toggle("hidden", !info.html_url);
    dot.classList.remove("hidden");
    if (sessionStorage.getItem("upd-toast") !== info.latest) {
      sessionStorage.setItem("upd-toast", info.latest);
      toast(t("settings.update_toast", { v: info.latest }));
    }
  } else {
    status.textContent = t("settings.update_latest") + sourceNote;
    runBtn.classList.add("hidden");
    link.classList.add("hidden");
    dot.classList.add("hidden");
  }
}

$("#btnUpdateCheck").addEventListener("click", () => loadUpdate(true));

$("#chkUpdateCheck").addEventListener("change", async () => {
  try {
    state.cfg = await api("/api/config", { method: "POST", body: {
      update_check_enabled: $("#chkUpdateCheck").checked,
    }});
  } catch (e) { toast(e.message, true); }
});

$("#btnUpdateRun").addEventListener("click", async () => {
  const info = state.update;
  if (!info || !info.available || !info.frozen) return;
  const label = t("settings.update_btn", { v: info.latest });
  if (!(await confirmDlg(t("settings.update_confirm", { v: info.latest }), label))) return;
  try {
    const r = await api("/api/update/run", { method: "POST", body: { tag: info.tag } });
    state._updateTaskId = r.task_id;
    $("#btnUpdateRun").disabled = true;
    toast(t("settings.update_running"));
    loadTasks();
  } catch (e) { toast(e.message, true); }
});

function showUpdateRestartOverlay() {
  if ($("#updateOverlay")) return;
  const note = document.createElement("div");
  note.id = "updateOverlay";
  note.className = "fullscreen-note";
  note.textContent = t("settings.update_restarting");
  document.body.appendChild(note);
}

// ------------------------------------------------------------ OVMS runtime (settings)

const VERSIONS_MAX = 10;

async function fetchVersions() {
  const ch = channel();
  const sel = $("#selVersion");
  sel.innerHTML = `<option value="">${esc(t("settings.version_fetching"))}</option>`;
  state.versionsChannel = ch;
  try {
    const all = await api(`/api/ovms/versions?channel=${ch}`);
    state.versions = all.slice(0, VERSIONS_MAX);
    if (!all.length) {
      sel.innerHTML = `<option value="">${esc(t("settings.version_not_found"))}</option>`;
      return;
    }
    sel.innerHTML = state.versions.map((v, i) => {
      const date = (v.published_at || "").slice(0, 10);
      return `<option value="${i}">${esc(v.label)} — ${fmtBytes(v.size)}${date ? " — " + date : ""}</option>`;
    }).join("");
    $("#installHint").textContent = t("settings.versions_shown",
      { shown: state.versions.length, total: all.length });
  } catch (e) {
    sel.innerHTML = `<option value="">${esc(t("settings.version_fetch_failed"))}</option>`;
    if (state.versionsChannel === ch) $("#installHint").textContent = e.message;
  }
}

$("#btnVersions").addEventListener("click", fetchVersions);
$$('input[name="channel"]').forEach(r => r.addEventListener("change", fetchVersions));

$("#btnInstall").addEventListener("click", async () => {
  const v = state.versions[Number($("#selVersion").value)];
  if (!v) { toast(t("settings.choose_version"), true); return; }
  try {
    await api("/api/ovms/install", { method: "POST", body: v });
    toast(t("settings.install_started", { label: v.label }));
    loadTasks();
  } catch (e) { toast(e.message, true); }
});

async function loadInstalled() {
  state.installed = await api("/api/ovms/installed");
  // auto-select the newest usable runtime when nothing valid is selected
  const ok = state.installed.filter(r => r.exe_ok);
  const selValid = ok.some(r => r.id === state.cfg.selected_runtime);
  if (!selValid && ok.length) {
    try {
      state.cfg = await api("/api/ovms/select", { method: "POST", body: { id: ok[0].id } });
      toast(t("settings.runtime_auto", { label: ok[0].label }));
    } catch { /* ignore */ }
  }
  const badge = $("#runtimeStatus");
  if (ok.length) {
    badge.textContent = state.cfg.selected_runtime
      ? `${t("status.selected")}: ${state.cfg.selected_runtime}` : t("status.none_selected");
    badge.className = state.cfg.selected_runtime ? "badge on" : "badge starting";
  } else {
    badge.textContent = t("status.not_installed");
    badge.className = "badge off";
  }
  renderSetup();
  const el = $("#installedList");
  if (!state.installed.length) {
    el.innerHTML = `<span class="muted">${esc(t("settings.installed_none"))}</span>`;
    return;
  }
  const sel = state.cfg.selected_runtime;
  el.innerHTML = state.installed.map(r => `
    <div class="item">
      <div class="top">
        <label>
          <input type="radio" name="runtime" value="${esc(r.id)}" ${r.id === sel ? "checked" : ""} ${r.exe_ok ? "" : "disabled"}>
          <span class="name">${esc(r.label)}</span>
        </label>
        <span class="tag">${esc(r.channel)}</span>
        ${r.id === sel ? `<span class="tag selected">${esc(t("status.selected"))}</span>` : ""}
        ${r.exe_ok ? "" : `<span class="tag unknown">${esc(t("status.no_exe"))}</span>`}
        <span class="actions">
          <button class="btn small danger" data-del-runtime="${esc(r.id)}">${esc(t("common.delete"))}</button>
        </span>
      </div>
      <div class="sub">${esc(r.id)}</div>
    </div>`).join("");
  $$('input[name="runtime"]', el).forEach(radio => radio.addEventListener("change", async () => {
    try {
      state.cfg = await api("/api/ovms/select", { method: "POST", body: { id: radio.value } });
      loadInstalled();
      toast(t("settings.runtime_selected", { id: radio.value }));
    } catch (e) { toast(e.message, true); }
  }));
  $$("[data-del-runtime]", el).forEach(b => b.addEventListener("click", async () => {
    if (!(await confirmDlg(t("settings.confirm_delete_runtime", { id: b.dataset.delRuntime })))) return;
    try { await api(`/api/ovms/runtime/${encodeURIComponent(b.dataset.delRuntime)}`, { method: "DELETE" }); loadInstalled(); }
    catch (e) { toast(e.message, true); }
  }));
}

// ------------------------------------------------------------ models

const KIND_LABEL = {
  text_generation: ["models.kind_llm", "llm"],
  image_generation: ["models.kind_image", "gen"],
  embeddings: ["models.kind_embeddings", "gen"],
  rerank: ["models.kind_rerank", "gen"],
  text2speech: ["models.kind_tts", "gen"],
  speech2text: ["models.kind_stt", "gen"],
  classic: ["models.kind_classic", "classic"],
  unknown: ["models.kind_unknown", "unknown"],
};
const MODE_ENDPOINT = {
  embeddings: "POST /v3/embeddings",
  rerank: "POST /v3/rerank",
  text2speech: "POST /v3/audio/speech",
  speech2text: "POST /v3/audio/transcriptions",
};

function kindLabel(m) {
  const entry = KIND_LABEL[m.kind] || KIND_LABEL.unknown;
  return [t(entry[0]), entry[1]];
}

async function loadModels() {
  state.models = await api("/api/models");
  renderModelSelect();
  renderSetup();
  renderModelsList();
}

function renderModelsList() {
  const el = $("#modelsList");
  if (!state.models.length) {
    el.innerHTML = `<span class="muted">${esc(t("common.none"))}</span>`;
    return;
  }
  el.innerHTML = state.models.map(m => {
    const [lbl, cls] = kindLabel(m);
    const origin = m.origin ? `<div class="sub">${esc(m.source)}: ${esc(m.origin)}</div>` : "";
    return `
    <div class="item">
      <div class="top">
        <span class="name">${esc(m.name)}</span>
        <span class="tag ${cls}">${esc(lbl)}</span>
        <span class="sub">${fmtBytes(m.size)} / ${esc(t("common.files", { n: m.files }))}</span>
        <span class="actions">
          <button class="btn small" data-use="${esc(m.name)}">${esc(t("common.load"))}</button>
          <button class="btn small danger" data-del="${esc(m.name)}">${esc(t("common.delete"))}</button>
        </span>
      </div>
      ${origin}
    </div>`;
  }).join("");
  $$("[data-use]", el).forEach(b => b.addEventListener("click", () => openLoadDialog(b.dataset.use)));
  $$("[data-del]", el).forEach(b => b.addEventListener("click", async () => {
    if (!(await confirmDlg(t("models.confirm_delete", { name: b.dataset.del })))) return;
    deleteModel(b.dataset.del);
  }));
}

// Optimistic: huge model folders can take a while to delete server-side.
async function deleteModel(name) {
  const idx = state.models.findIndex(m => m.name === name);
  if (idx < 0) return;
  const [removed] = state.models.splice(idx, 1);
  renderModelsList();
  renderModelSelect();
  renderSetup();
  try {
    await api(`/api/models/${encodeURIComponent(name)}`, { method: "DELETE" });
  } catch (e) {
    state.models.splice(idx, 0, removed);
    renderModelsList();
    renderModelSelect();
    renderSetup();
    toast(e.message, true);
  }
  loadModels().catch(() => {});
}

function renderModelSelect() {
  const sel = $("#selModel");
  const loaded = state.status.running ? state.status.model : null;
  const cur = loaded || state.cfg.selected_model || sel.value;
  const sig = state.models.map(m => `${m.name}:${m.kind}:${m.size}`).join("|") + `||${cur}`;
  if (sig === state._modelSelectSig) return;  // rebuilding the select on every poll is janky
  state._modelSelectSig = sig;
  if (!state.models.length) {
    sel.innerHTML = `<option value="">${esc(t("chat.no_models"))}</option>`;
    return;
  }
  sel.innerHTML = state.models.map(m => {
    const [lbl] = kindLabel(m);
    return `<option value="${esc(m.name)}" ${m.name === cur ? "selected" : ""}>${esc(m.name)}  [${esc(lbl)}] ${fmtBytes(m.size)}</option>`;
  }).join("");
}

$("#btnModelsReload").addEventListener("click", () => loadModels().catch(e => toast(e.message, true)));

$("#btnHF").addEventListener("click", async () => {
  const repo = $("#hfRepo").value.trim();
  if (!repo) { toast(t("models.enter_repo"), true); return; }
  try {
    await api("/api/models/download_hf", { method: "POST", body: {
      repo_id: repo,
      revision: $("#hfRev").value.trim() || null,
      allow_patterns: $("#hfAllow").value.trim() || null,
    }});
    toast(t("models.download_started", { id: repo }));
    loadTasks();
  } catch (e) { toast(e.message, true); }
});

$("#btnURL").addEventListener("click", async () => {
  const url = $("#urlInput").value.trim();
  if (!url) { toast(t("models.enter_url"), true); return; }
  try {
    await api("/api/models/download_url", { method: "POST", body: {
      url, name: $("#urlName").value.trim() || null, extract: $("#urlExtract").checked,
    }});
    toast(t("models.download_started", { id: url.slice(0, 60) }));
    loadTasks();
  } catch (e) { toast(e.message, true); }
});

// ------------------------------------------------------------ model search (OpenVINO IR only)

function fmtCount(n) {
  return Number(n || 0).toLocaleString();
}

const SEARCH_PAGE_SIZE = 20;

function searchItemHtml(m) {
  return `
    <div class="item">
      <div class="top">
        <span class="name">${esc(m.repo_id)}</span>
        <span class="tag llm">${esc(t("search.ir_badge"))}</span>
        ${m.pipeline_tag ? `<span class="tag">${esc(m.pipeline_tag)}</span>` : ""}
        ${m.gated ? `<span class="tag unknown">${esc(t("search.gated"))}</span>` : ""}
        <span class="actions">
          <a class="btn small" href="https://huggingface.co/${esc(encodeURI(m.repo_id))}" target="_blank" rel="noopener noreferrer">${esc(t("search.open_hf"))}</a>
          <button class="btn small primary" data-dl-repo="${esc(m.repo_id)}">${esc(t("models.download"))}</button>
        </span>
      </div>
      <div class="sub">${esc(t("search.stats", {
        downloads: fmtCount(m.downloads), likes: fmtCount(m.likes),
        files: fmtCount(m.files), date: (m.last_modified || "").slice(0, 10),
      }))}</div>
    </div>`;
}

async function searchModels() {
  const q = $("#hfSearchQuery").value.trim();
  const el = $("#hfSearchResults");
  if (!q) { toast(t("search.enter_query"), true); return; }
  const btn = $("#btnHfSearch");
  btn.disabled = true;
  el.innerHTML = `<span class="muted">${esc(t("search.searching"))}</span>`;
  state.hfSearch = [];
  state.hfSearchNext = null;
  state.hfSearchQuery = q;
  $("#btnHfSearchMore").classList.add("hidden");
  try {
    const r = await api(`/api/models/search?q=${encodeURIComponent(q)}`
      + `&sort=${encodeURIComponent($("#hfSearchSort").value)}&limit=${SEARCH_PAGE_SIZE}`);
    state.hfSearch = r.results || [];
    state.hfSearchNext = r.next || null;
    renderSearchResults();
  } catch (e) {
    el.innerHTML = `<span class="muted">${esc(t("search.failed", { msg: e.message }))}</span>`;
    toast(e.message, true);
  } finally {
    btn.disabled = false;
  }
}

async function loadMoreSearch() {
  if (!state.hfSearchNext || $("#btnHfSearchMore").disabled) return;
  const btn = $("#btnHfSearchMore");
  btn.disabled = true;
  btn.textContent = t("search.loading_more");
  try {
    const r = await api(`/api/models/search?q=${encodeURIComponent(state.hfSearchQuery)}`
      + `&sort=${encodeURIComponent($("#hfSearchSort").value)}&limit=${SEARCH_PAGE_SIZE}`
      + `&cursor=${encodeURIComponent(state.hfSearchNext)}`);
    state.hfSearch = state.hfSearch.concat(r.results || []);
    state.hfSearchNext = r.next || null;
    renderSearchResults();
  } catch (e) {
    toast(t("search.next_page_failed", { msg: e.message }), true);
  } finally {
    btn.disabled = false;
    btn.textContent = t("search.load_more");
  }
}

function renderSearchResults() {
  const el = $("#hfSearchResults");
  const items = state.hfSearch || [];
  const moreBtn = $("#btnHfSearchMore");
  if (!items.length) {
    el.innerHTML = `<span class="muted">${esc(t("search.none"))}</span>`;
    moreBtn.classList.add("hidden");
    return;
  }
  const scrollTop = el.scrollTop;
  el.innerHTML = `<div class="muted small">${esc(t("search.results", { n: items.length }))}</div>`
    + items.map(searchItemHtml).join("");
  el.scrollTop = scrollTop;
  $$("[data-dl-repo]", el).forEach(b => b.addEventListener("click", () => downloadSearchResult(b.dataset.dlRepo)));
  moreBtn.classList.toggle("hidden", !state.hfSearchNext);
}

async function downloadSearchResult(repo) {
  try {
    await api("/api/models/download_hf", { method: "POST", body: {
      repo_id: repo, ir_only: $("#hfIrOnly").checked,
    }});
    toast(t("models.download_started", { id: repo }));
    loadTasks();
  } catch (e) { toast(e.message, true); }
}

$("#btnHfSearch").addEventListener("click", searchModels);
$("#btnHfSearchMore").addEventListener("click", loadMoreSearch);
$("#hfSearchQuery").addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); searchModels(); }
});
// infinite scroll inside the result pane (the button stays as a fallback)
$("#hfSearchResults").addEventListener("scroll", () => {
  const el = $("#hfSearchResults");
  if (!state.hfSearchNext) return;
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) loadMoreSearch();
});

// ------------------------------------------------------------ setup guide

function renderSetup() {
  const okRuntimes = state.installed.filter(r => r.exe_ok);
  const hasRuntime = okRuntimes.length > 0 && okRuntimes.some(r => r.id === state.cfg.selected_runtime);
  const hasModels = state.models.length > 0;
  const need = !hasRuntime || !hasModels;
  $("#setupCard").classList.toggle("hidden", !need);
  if (!need) return;
  const rt = $("#stRuntime");
  rt.className = "step " + (hasRuntime ? "ok" : "ng");
  rt.textContent = hasRuntime
    ? t("setup.runtime_ok", { label: (okRuntimes.find(r => r.id === state.cfg.selected_runtime) || {}).label || "" })
    : t("setup.runtime_missing");
  const mo = $("#stModel");
  mo.className = "step " + (hasModels ? "ok" : "ng");
  mo.textContent = hasModels
    ? t("setup.models_count", { n: state.models.length }) : t("setup.models_missing");
  $("#btnQuickInstall").classList.toggle("hidden", hasRuntime);
  $("#btnGoSettings").classList.toggle("hidden", hasRuntime);
  $("#btnGoModels").classList.toggle("hidden", hasModels);
}

$("#btnQuickInstall").addEventListener("click", async () => {
  const b = $("#btnQuickInstall");
  b.disabled = true;
  try {
    const r = await api("/api/ovms/install_latest", { method: "POST", body: { channel: "stable" } });
    toast(t("settings.install_started_tasks", { label: r.label }));
    loadTasks();
  } catch (e) { toast(e.message, true); }
  b.disabled = false;
});
$("#btnGoSettings").addEventListener("click", () => showView("settings"));
$("#btnGoModels").addEventListener("click", () => showView("models"));

// ------------------------------------------------------------ model load / unload

const LOAD_FIELDS = ["max_prompt_len", "cache_size", "max_num_seqs", "max_num_batched_tokens"];
const LOAD_INPUTS = { max_prompt_len: "#ldMaxLen", cache_size: "#ldCache", max_num_seqs: "#ldSeqs", max_num_batched_tokens: "#ldMBT" };

function refreshLlmOptionVisibility() {
  // LLM load options apply to text_generation only
  const m = $("#ldMode").value;
  $("#ldLlm").classList.toggle("hidden", !(m === "text_generation" || m === "auto"));
  // max_prompt_len is NPU-only (CPU/GPU plugins reject it)
  $("#ldMaxLenRow").classList.toggle("hidden", $("#ldDevice").value !== "NPU");
}
$("#ldMode").addEventListener("change", refreshLlmOptionVisibility);
$("#ldDevice").addEventListener("change", refreshLlmOptionVisibility);

function fillDeviceOptions(devices, preferred) {
  const sel = $("#ldDevice");
  sel.innerHTML = ["AUTO", ...devices]
    .map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join("");
  const wanted = String(preferred || "").toUpperCase();
  sel.value = (wanted === "AUTO" || devices.includes(wanted)) ? wanted : "AUTO";
}

async function openLoadDialog(name) {
  const model = (name || $("#selModel").value || "").trim();
  if (!model) { toast(t("chat.select_model"), true); return; }
  let opts = {};
  try { opts = await api(`/api/model/load_options?model=${encodeURIComponent(model)}`); } catch { /* use defaults */ }
  $("#loadModelName").textContent = model;
  // Show cached / last-known devices immediately; the real probe result is filled in below.
  const devices = (Array.isArray(opts.devices) && opts.devices.length) ? opts.devices
    : (Array.isArray(state.devices) && state.devices.length ? state.devices : ["CPU", "GPU"]);
  fillDeviceOptions(devices, opts.device);
  $("#ldMode").value = opts.mode || "auto";
  for (const k of LOAD_FIELDS) $(LOAD_INPUTS[k]).value = opts[k] ?? "";
  $("#ldCachePrec").value = opts.kv_cache_precision || "";
  $("#ldPrefix").checked = opts.enable_prefix_caching !== false;  // default true
  refreshLlmOptionVisibility();
  $("#loadOverlay").dataset.model = model;
  $("#loadOverlay").classList.remove("hidden");
  // Never block the dialog on the OpenVINO device probe.
  api("/api/ovms/devices").then(r => {
    if (!Array.isArray(r.devices) || !r.devices.length) return;
    state.devices = r.devices;
    const overlay = $("#loadOverlay");
    if (overlay.classList.contains("hidden") || overlay.dataset.model !== model) return;
    fillDeviceOptions(r.devices, $("#ldDevice").value);
    refreshLlmOptionVisibility();
  }).catch(() => { /* keep the fallback list */ });
}

$("#ldCancel").addEventListener("click", () => $("#loadOverlay").classList.add("hidden"));

$("#ldRecommend").addEventListener("click", async () => {
  const model = $("#loadOverlay").dataset.model;
  try {
    const r = await api(`/api/model/recommend?model=${encodeURIComponent(model)}`);
    $("#ldCache").value = r.cache_size;
    $("#ldSeqs").value = r.max_num_seqs;
    $("#ldCachePrec").value = r.kv_cache_precision || "";
    $("#ldRecommendInfo").textContent = t("load.recommend_info", {
      size: r.model_size_gb, ram: r.free_ram_gb, cache: r.cache_size,
      u8: r.kv_cache_precision ? t("load.recommend_u8") : "",
    });
  } catch (e) { toast(e.message, true); }
});

$("#ldOk").addEventListener("click", async () => {
  const model = $("#loadOverlay").dataset.model;
  const body = { model, device: $("#ldDevice").value, mode: $("#ldMode").value };
  for (const k of LOAD_FIELDS) {
    const v = $(LOAD_INPUTS[k]).value;
    if (v !== "") body[k] = Number(v);
  }
  if ($("#ldCachePrec").value) body.kv_cache_precision = $("#ldCachePrec").value;
  if (!$("#ldPrefix").checked) body.enable_prefix_caching = false;
  $("#ldOk").disabled = true;
  try {
    const info = await api("/api/model/load", { method: "POST", body });
    $("#loadOverlay").classList.add("hidden");
    state.cfg.selected_model = model;
    showView("chat");
    toast(t("load.started", { model, mode: info.mode, device: info.device }));
  } catch (e) {
    toast(e.message, true);
  } finally {
    $("#ldOk").disabled = false;
  }
  loadStatus();
});

$("#btnLoad").addEventListener("click", () => openLoadDialog());
$("#btnUnload").addEventListener("click", async () => {
  try { await api("/api/model/unload", { method: "POST" }); toast(t("chat.unloaded_toast")); }
  catch (e) { toast(e.message, true); }
  loadStatus();
});

async function loadStatus() {
  let st;
  try { st = await api("/api/server/status"); } catch { return; }
  const sig = JSON.stringify([st.running, st.ready, st.load_state, st.load_error, st.model,
                              st.mode, st.device, st.pid, st.exit_code, st.started_at]);
  if (sig === state._statusSig) return;  // nothing changed -> no DOM work
  state._statusSig = sig;
  state.status = st;
  const badge = $("#loadBadge");
  if (st.load_state === "failed") {
    badge.textContent = t("status.failed");
    badge.className = "badge fail";
    if (state._failToastFor !== st.started_at) {
      state._failToastFor = st.started_at;
      toast(t("load.failed_toast", { error: st.load_error || t("load.failed_detail") }), true);
    }
  } else if (st.running && st.ready) {
    badge.textContent = t("status.loaded");
    badge.className = "badge on";
  } else if (st.running) {
    badge.textContent = t("status.loading");
    badge.className = "badge starting";
  } else {
    badge.textContent = t("status.not_loaded");
    badge.className = "badge off";
  }
  $("#btnLoad").classList.toggle("hidden", !!st.running);
  $("#btnUnload").classList.toggle("hidden", !st.running);
  $("#selModel").disabled = !!st.running;
  // details (model/mode/device/PID) live in the badge tooltip to keep the header simple
  badge.title = st.running
    ? `${st.model} / ${st.mode} / ${st.device} / PID ${st.pid}${st.ready ? "" : t("chat.starting")}`
    : "";
  renderModelSelect();
  renderPlayNote();
  renderModeUI();
  // notify when OVMS terminated unexpectedly (exit code surfaced by backend)
  if (!st.running && st.exit_code != null) {
    if (state._exitSeen === undefined) {
      state._exitSeen = st.exit_code;  // don't nag about old crashes on first load
    } else if (state._exitSeen !== st.exit_code) {
      state._exitSeen = st.exit_code;
      if (st.exit_code !== 0 && st.exit_code !== null) {
        toast(t("status.ovms_exited_toast", { code: st.exit_code }), true);
        if ($("#tab-logs")) loadLogs();
      }
    }
  }
}

function renderPlayNote() {
  const st = state.status;
  const note = $("#playNote");
  if (st.load_state === "failed") {
    note.textContent = t("chat.load_failed_note", { error: st.load_error || "?" });
  } else if (st.running && st.ready) {
    note.textContent = st.mode === "classic" ? t("chat.classic_note") : "";
  } else if (st.running) {
    note.textContent = t("chat.loading_note");
  } else {
    note.textContent = t("chat.idle_note");
  }
}

// chat vs image-generation vs API-only, based on loaded mode
function renderModeUI() {
  const st = state.status;
  const loaded = st.running && st.ready;
  const mode = loaded ? st.mode : null;
  const isChat = !loaded || mode === "text_generation";
  const isImage = mode === "image_generation";
  $("#chatLog").classList.toggle("hidden", !!loaded && !isChat);
  $("#composerWrap").classList.toggle("hidden", !!loaded && !isChat);
  $("#paramsSide")?.classList.toggle("hidden", !!loaded && !isChat);
  $("#btnParams")?.classList.toggle("hidden", !!loaded && !isChat);
  $("#imagePanel").classList.toggle("hidden", !isImage);
  if (loaded && !isChat && !isImage) {
    const ep = MODE_ENDPOINT[mode] || t("chat.endpoint_classic");
    $("#chatLog").classList.remove("hidden");
    $("#chatLog").innerHTML = `<div class="chatcol"><div class="empty-hint">
      <h1>${esc(st.model || "")}</h1>
      <p>${esc(t("chat.mode_unsupported", { mode }))}</p>
      <p>${esc(t("chat.api_endpoint", { endpoint: ep }))}</p>
    </div></div>`;
  } else if (isChat && (!state.chat || !state.chat.messages.length)) {
    renderChat();
  }
}

// ------------------------------------------------------------ image generation

$("#btnGenImg").addEventListener("click", async () => {
  const st = state.status;
  if (!st.running || !st.ready) { toast(t("chat.no_model"), true); return; }
  const prompt = $("#imgPrompt").value.trim();
  if (!prompt) { toast(t("image.enter_prompt"), true); return; }
  const btn = $("#btnGenImg");
  btn.disabled = true; btn.textContent = t("image.generating");
  const t0 = Date.now();
  try {
    const resp = await fetch("/proxy/v3/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept-Language": LANG },
      body: JSON.stringify({ model: st.model, prompt, size: $("#imgSize").value, n: 1 }),
    });
    if (!resp.ok) throw new Error((await resp.text()).slice(0, 400));
    const j = await resp.json();
    const item = (j.data || [])[0] || {};
    const src = item.b64_json ? `data:image/png;base64,${item.b64_json}` : item.url;
    if (!src) throw new Error(t("image.no_data"));
    const wrap = document.createElement("div");
    const el = document.createElement("img");
    el.src = src;
    wrap.appendChild(el);
    const cap = document.createElement("div");
    cap.className = "gen-note";
    cap.textContent = t("image.caption", { sec: ((Date.now() - t0) / 1000).toFixed(1), prompt });
    wrap.appendChild(cap);
    const out = $("#imgOut");
    out.insertBefore(wrap, out.firstChild);
  } catch (e) {
    toast(t("image.error", { msg: e.message }), true);
  } finally {
    btn.disabled = false; btn.textContent = t("image.generate");
  }
});
$("#imgPrompt").addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); $("#btnGenImg").click(); }
});

async function loadLogs() {
  try {
    const r = await api("/api/server/logs?tail=300");
    const el = $("#logs");
    el.textContent = r.lines.join("\n");
    el.scrollTop = el.scrollHeight;
  } catch { /* ignore */ }
}
$("#btnLogsReload").addEventListener("click", loadLogs);

// ------------------------------------------------------------ app shutdown

async function doShutdown() {
  if (!(await confirmDlg(t("settings.confirm_shutdown"), t("settings.exit_ok")))) return;
  try {
    await api("/api/shutdown", { method: "POST" });
    toast(t("settings.shutting_down"));
    const note = document.createElement("div");
    note.className = "fullscreen-note";
    note.textContent = t("settings.shutdown_done");
    document.body.appendChild(note);
  } catch (e) { toast(e.message, true); }
}
$("#btnShutdown")?.addEventListener("click", doShutdown);

// ------------------------------------------------------------ tasks panel

const _doneHandled = new Set();

function createTaskEl(task) {
  const el = document.createElement("div");
  el.className = "task " + task.status;
  el.innerHTML = `
    <div class="t-row">
      <span class="t-title"></span>
      <span class="t-msg"></span>
      <button class="btn small hidden" data-cancel>${esc(t("task.cancel"))}</button>
    </div>
    <div class="progress"><div style="width:0%"></div></div>`;
  const refs = {
    el,
    title: el.querySelector(".t-title"),
    msg: el.querySelector(".t-msg"),
    bar: el.querySelector(".progress"),
    fill: el.querySelector(".progress > div"),
    cancel: el.querySelector("[data-cancel]"),
  };
  refs.cancel.addEventListener("click", async () => {
    refs.cancel.disabled = true;
    try { await api(`/api/tasks/${task.id}/cancel`, { method: "POST" }); }
    catch (e) { toast(e.message, true); }
    loadTasks();
  });
  return refs;
}

function updateTaskEl(refs, task) {
  const pct = task.progress == null ? null : Math.round(task.progress * 100);
  const indeterminate = pct == null && task.status === "running";
  const cls = "task " + task.status;
  if (refs.el.className !== cls) refs.el.className = cls;
  if (refs.title.textContent !== task.title) refs.title.textContent = task.title;
  const bytesText = task.total_bytes ? ` ${fmtBytes(task.downloaded_bytes)} / ${fmtBytes(task.total_bytes)}` : "";
  const msg = task.status === "error"
    ? t("task.error", { msg: task.error })
    : task.message + (task.status === "done" ? "" : bytesText);
  if (refs.msg.textContent !== msg) refs.msg.textContent = msg;
  const barClass = indeterminate ? "progress indeterminate" : "progress";
  if (refs.bar.className !== barClass) refs.bar.className = barClass;
  const width = indeterminate ? "30%" : (pct == null ? "0%" : pct + "%");
  if (refs.fill.style.width !== width) refs.fill.style.width = width;  // animates via CSS transition
  refs.cancel.classList.toggle("hidden", task.status !== "running");
  refs.cancel.disabled = false;
}

async function loadTasks() {
  try { state.tasks = await api("/api/tasks"); } catch { return; }
  const now = Date.now() / 1000;
  const visible = state.tasks.filter(t2 => t2.status === "running" || (t2.finished_at && now - t2.finished_at < 15));
  const panel = $("#taskPanel");
  const list = $("#taskList");
  const seen = new Set();
  for (const task of visible) {
    seen.add(task.id);
    let refs = state._taskEls.get(task.id);
    if (!refs) {
      refs = createTaskEl(task);
      state._taskEls.set(task.id, refs);
      list.appendChild(refs.el);
    }
    updateTaskEl(refs, task);
  }
  for (const [tid, refs] of [...state._taskEls]) {
    if (!seen.has(tid)) { refs.el.remove(); state._taskEls.delete(tid); }
  }
  const order = visible.map(x => x.id).join();
  if (panel.dataset.order !== order) {
    panel.dataset.order = order;
    for (const task of visible) list.appendChild(state._taskEls.get(task.id).el);
  }
  panel.classList.toggle("hidden", !visible.length);
  for (const task of state.tasks) {
    if (task.kind !== "update" || task.id !== state._updateTaskId) continue;
    if (task.status === "done") {
      state._updateTaskId = null;
      showUpdateRestartOverlay();
    } else if (task.status === "error") {
      state._updateTaskId = null;
      $("#btnUpdateRun").disabled = false;
      toast(t("task.error", { msg: task.error }), true);
    }
  }
  let needModels = false, needInstalled = false;
  for (const task of state.tasks) {
    if ((task.status !== "done" && task.status !== "cancelled") || _doneHandled.has(task.id)) continue;
    _doneHandled.add(task.id);
    if (task.kind === "model") needModels = true;
    if (task.kind === "ovms") needInstalled = true;
  }
  if (needModels) loadModels();
  if (needInstalled) loadInstalled();
}

// ------------------------------------------------------------ chats

async function loadChatList(selectId = null) {
  state.chats = await api("/api/chats");
  renderChatList(selectId);
}

function renderChatList(selectId = null) {
  const el = $("#chatSessions");
  if (!state.chats.length) {
    el.innerHTML = `<div class="muted sess-empty">${esc(t("chat.no_sessions"))}</div>`;
    return;
  }
  const cur = selectId || (state.chat && state.chat.id);
  el.innerHTML = state.chats.map(c => `
    <div class="sess ${c.id === cur ? "active" : ""}" data-chat="${esc(c.id)}" title="${esc(c.title)}">
      <span class="t">${esc(c.title)}${c.model ? `<span class="m">${esc(c.model)}</span>` : ""}</span>
      <button class="x" data-del-chat="${esc(c.id)}" title="${esc(t("common.delete"))}">×</button>
    </div>`).join("");
  $$("[data-chat]", el).forEach(s => s.addEventListener("click", async e => {
    if (e.target.dataset.delChat) return;
    await openChat(s.dataset.chat);
  }));
  $$("[data-del-chat]", el).forEach(b => b.addEventListener("click", async e => {
    e.stopPropagation();
    if (!(await confirmDlg(t("chat.confirm_delete")))) return;
    deleteChat(b.dataset.delChat);
  }));
}

// Optimistic: the session disappears from the sidebar immediately.
async function deleteChat(id) {
  const idx = state.chats.findIndex(c => c.id === id);
  const removed = idx >= 0 ? state.chats.splice(idx, 1)[0] : null;
  if (state.chat && state.chat.id === id) { state.chat = null; renderChat(); }
  renderChatList();
  try {
    await api(`/api/chats/${id}`, { method: "DELETE" });
  } catch (err) {
    if (removed) state.chats.splice(idx, 0, removed);
    renderChatList();
    toast(err.message, true);
  }
  loadChatList();
}

async function openChat(id) {
  showView("chat");
  clearTimeout(state._titleTimer);
  state._titleTimer = null;
  try {
    state.chat = await api(`/api/chats/${id}`);
  } catch (e) { toast(e.message, true); return; }
  applyParamsToUI(state.chat.params || DEFAULT_PARAMS);
  setParamsSaveState("");
  renderChat();
  loadChatList(id);
}

// New chat is lazy: nothing is created until the first prompt is sent.
$("#btnNewChat").addEventListener("click", () => {
  showView("chat");
  clearTimeout(state._titleTimer);
  state._titleTimer = null;
  state.chat = null;
  setParamsSaveState("");
  renderChat();
  loadChatList();
  $("#pgInput").focus();
});

function renderChat() {
  const log = $("#chatLog");
  const c = state.chat;
  if (!c || !c.messages.length) {
    log.innerHTML = `<div class="chatcol"><div class="empty-hint">
      <h1>${esc(t("app.name"))}</h1>
      <p>${esc(t("chat.empty_note"))}</p></div></div>`;
    return;
  }
  log.innerHTML = `<div class="chatcol"></div>`;
  const col = log.firstChild;
  for (const m of c.messages) {
    if (m.role === "system") continue;
    col.appendChild(msgEl(m.role, m.content));
  }
  log.scrollTop = log.scrollHeight;
  state.stickBottom = true;
}

function msgEl(role, text) {
  const el = document.createElement("div");
  el.className = "msg " + role;
  el.innerHTML = `<div class="who">${role === "user" ? "U" : "AI"}</div>
    <div class="body"><div class="think hidden"></div><div class="txt"></div></div>`;
  const txt = el.querySelector(".txt");
  if (role === "assistant") txt.innerHTML = renderMarkdown(text);
  else txt.textContent = text;
  return el;
}

// ------------------------------------------------------------ params sidebar
// Always-visible right sidebar. Changes are per-chat, autosaved, and apply from
// the next message.

const PARAM_INPUTS = {
  temperature: ["#pTemp", "#pvTemp", "#nTemp"],
  top_p: ["#pTopP", "#pvTopP", "#nTopP"],
  top_k: ["#pTopK", "#pvTopK", "#nTopK"],
  max_tokens: ["#pMax", "#pvMax", "#nMax"],
  repetition_penalty: ["#pRep", "#pvRep", "#nRep"],
};

function currentParams() {
  return {
    temperature: Number($("#pTemp").value),
    top_p: Number($("#pTopP").value),
    top_k: Number($("#pTopK").value),
    max_tokens: Number($("#pMax").value),
    repetition_penalty: Number($("#pRep").value),
    system_prompt: $("#pSystem").value.trim(),
    suppress_thinking: $("#pSuppressThink").checked,
  };
}

function applyParamsToUI(p) {
  const merged = { ...DEFAULT_PARAMS, ...(p || {}) };
  for (const [k, [inp, lab, num]] of Object.entries(PARAM_INPUTS)) {
    if ($(inp)) $(inp).value = merged[k];
    if ($(lab)) $(lab).textContent = merged[k];
    if (num && $(num)) $(num).value = merged[k];
  }
  $("#pSystem").value = merged.system_prompt || "";
  $("#pSuppressThink").checked = !!merged.suppress_thinking;
}

function setParamsSaveState(msg) {
  const el = $("#paramsSaveState");
  if (el) el.textContent = msg || "";
}

let _paramsSaveTimer = null;
function scheduleParamsAutosave() {
  setParamsSaveState(t("params.state_editing"));
  clearTimeout(_paramsSaveTimer);
  _paramsSaveTimer = setTimeout(saveParamsNow, 600);
}

async function saveParamsNow() {
  const c = state.chat;
  const params = currentParams();
  if (c) c.params = params;  // applies from the next send, no server round-trip needed
  if (!c) { setParamsSaveState(t("params.state_no_chat")); return; }
  setParamsSaveState(t("params.state_saving"));
  try {
    await api(`/api/chats/${c.id}`, { method: "PUT", body: {
      title: c.title, model: c.model, params, messages: c.messages,
    }});
    setParamsSaveState(t("params.state_saved"));
  } catch (e) {
    setParamsSaveState(t("params.state_save_failed"));
  }
}

for (const [k, [inp, lab, num]] of Object.entries(PARAM_INPUTS)) {
  $(inp)?.addEventListener("input", () => {
    $(lab).textContent = $(inp).value;
    if (num && $(num)) $(num).value = $(inp).value;
    scheduleParamsAutosave();
  });
  $(num)?.addEventListener("input", () => {
    if ($(num).value === "") return;
    $(inp).value = $(num).value;
    $(lab).textContent = $(num).value;
    scheduleParamsAutosave();
  });
  $(num)?.addEventListener("change", () => {
    // clamp out-of-range values back through the slider
    if ($(num).value === "") { $(num).value = $(inp).value; return; }
    $(inp).value = $(num).value;
    $(num).value = $(inp).value;
    $(lab).textContent = $(inp).value;
    scheduleParamsAutosave();
  });
}
$("#pSystem")?.addEventListener("input", scheduleParamsAutosave);
$("#pSuppressThink")?.addEventListener("change", scheduleParamsAutosave);
$("#btnParams").addEventListener("click", () => {
  const collapsed = $("#view-chat").classList.toggle("params-collapsed");
  localStorage.setItem("paramsCollapsed", collapsed ? "1" : "0");
});
$("#btnParamsReset").addEventListener("click", () => {
  applyParamsToUI(DEFAULT_PARAMS);
  scheduleParamsAutosave();
});
// Start with the parameters panel collapsed for a cleaner chat; the choice sticks.
if (localStorage.getItem("paramsCollapsed") !== "0") $("#view-chat")?.classList.add("params-collapsed");

// ------------------------------------------------------------ send / stream

async function ensureChat() {
  if (state.chat) return state.chat;
  state.chat = await api("/api/chats", { method: "POST" });
  loadChatList(state.chat.id);
  return state.chat;
}

async function saveCurrentChat() {
  const c = state.chat;
  if (!c) return;
  try {
    await api(`/api/chats/${c.id}`, { method: "PUT", body: {
      title: c.title, model: c.model, params: c.params, messages: c.messages,
    }});
  } catch (e) { toast(t("chat.history_save_failed", { msg: e.message }), true); }
  loadChatList(c.id);
}

async function sendChat() {
  if (state.sending) return;
  clearTimeout(state._titleTimer);  // never generate a title while the user is active
  state._titleTimer = null;
  const st = state.status;
  if (!st.running || !st.ready) { toast(t("chat.no_model"), true); return; }
  const input = $("#pgInput");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";

  const chat = await ensureChat();
  chat.params = currentParams();
  chat.model = st.model || chat.model;
  chat.messages.push({ role: "user", content: text });
  if (isDefaultTitle(chat.title)) {
    chat.title = text.slice(0, 40);  // provisional; upgraded after the first answer
    chat._autoTitle = true;
  }

  const log = $("#chatLog");
  if (log.querySelector(".empty-hint")) renderChat(); else log.firstChild.appendChild(msgEl("user", text));
  state.stickBottom = true;  // sending always re-follows the tail
  log.scrollTop = log.scrollHeight;

  const aEl = msgEl("assistant", "");
  (log.querySelector(".chatcol") || log).appendChild(aEl);
  const txtEl = aEl.querySelector(".txt");
  const thinkEl = aEl.querySelector(".think");

  state.sending = true;
  state.abort = new AbortController();
  $("#btnSend").classList.add("hidden");
  $("#btnAbort").classList.remove("hidden");

  const reqMessages = chat.params.system_prompt
    ? [{ role: "system", content: chat.params.system_prompt }, ...chat.messages]
    : chat.messages;
  const body = {
    model: st.model,
    messages: reqMessages,
    temperature: chat.params.temperature,
    top_p: chat.params.top_p,
    max_tokens: chat.params.max_tokens,
    stream: true,
  };
  if (chat.params.top_k > 0) body.top_k = chat.params.top_k;
  if (chat.params.repetition_penalty !== 1.0) body.repetition_penalty = chat.params.repetition_penalty;
  if (chat.params.suppress_thinking) body.chat_template_kwargs = { enable_thinking: false };

  let finishReason = "";
  let aborted = false;

  let answer = "", think = "";
  let lastPaint = 0;
  const paint = (force = false) => {  // runs inside requestAnimationFrame
    const now = performance.now();
    if (!force && now - lastPaint < 150) return;
    lastPaint = now;
    thinkEl.classList.toggle("hidden", !think);
    if (thinkEl.textContent !== think) thinkEl.textContent = think;
    // Long answers stream as plain text to stay smooth; rendered as markdown on completion.
    if (force || answer.length <= 8000) txtEl.innerHTML = renderMarkdown(answer);
    else if (txtEl.textContent !== answer) txtEl.textContent = answer;
    if (state.stickBottom) log.scrollTop = log.scrollHeight;
  };
  const repaint = (force = false) => scheduleFrame(() => paint(force));
  try {
    const resp = await fetch("/proxy/v3/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept-Language": LANG },
      body: JSON.stringify(body),
      signal: state.abort.signal,
    });
    if (!resp.ok) {
      let msg = `${resp.status}`;
      try { msg = await resp.text(); } catch { /* ignore */ }
      throw new Error(msg.slice(0, 500));
    }
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const ev = buf.slice(0, idx); buf = buf.slice(idx + 2);
        for (const line of ev.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const d = line.slice(5).trim();
          if (d === "[DONE]") continue;
          try {
            const ch = JSON.parse(d).choices?.[0] || {};
            const delta = ch.delta || {};
            if (ch.finish_reason) finishReason = ch.finish_reason;
            if (delta.reasoning_content) think += delta.reasoning_content;
            if (delta.content) answer += delta.content;
            repaint();
          } catch { /* partial json */ }
        }
      }
    }
    repaint(true);
    // thinking model exhausted the token budget before answering
    if (!answer && think && finishReason === "length") {
      answer = t("chat.token_limit");
      repaint(true);
    }
  } catch (e) {
    aborted = e.name === "AbortError";
    answer = answer || "";
    answer += aborted ? t("chat.aborted") : t("chat.error", { msg: e.message });
    repaint(true);
  } finally {
    state.sending = false;
    state.abort = null;
    $("#btnSend").classList.remove("hidden");
    $("#btnAbort").classList.add("hidden");
    repaint(true);
    chat.messages.push({ role: "assistant", content: answer });
    saveCurrentChat();
    if (!aborted && answer && chat._autoTitle) scheduleTitleGeneration(chat);
  }
}

// Ask the loaded model for a short chat title, but only once the user pauses:
// generating it immediately would occupy the single inference slot and make the
// next prompt feel sluggish.
const TITLE_IDLE_MS = 8000;

function scheduleTitleGeneration(chat) {
  clearTimeout(state._titleTimer);
  state._titleTimer = setTimeout(() => {
    state._titleTimer = null;
    if (state.sending) return;  // the user is busy again
    generateChatTitle(chat);
  }, TITLE_IDLE_MS);
}

async function generateChatTitle(chat) {
  if (!chat || !chat._autoTitle) return;
  chat._autoTitle = false;
  const st = state.status;
  if (!st.running || !st.ready) return;
  const firstUser = (chat.messages.find(m => m.role === "user") || {}).content || "";
  const firstAnswer = (chat.messages.find(m => m.role === "assistant") || {}).content || "";
  if (!firstUser || !firstAnswer) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);  // never tie up the model for long
  try {
    const resp = await fetch("/proxy/v3/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept-Language": LANG },
      body: JSON.stringify({
        model: st.model,
        messages: [
          { role: "system", content: "You create short chat titles." },
          { role: "user", content: "Create a concise title of 3-6 words in the same language as this "
              + "conversation. Reply with the title only, no quotes, no trailing punctuation.\n\n"
              + `User: ${firstUser.slice(0, 800)}\n\nAssistant: ${firstAnswer.slice(0, 800)}` },
        ],
        max_tokens: 24,
        temperature: 0.2,
        stream: false,
        chat_template_kwargs: { enable_thinking: false },  // keep thinking models fast
      }),
      signal: controller.signal,
    });
    if (!resp.ok) return;
    const data = await resp.json();
    let title = ((data.choices || [])[0]?.message?.content || "").trim();
    title = title.replace(/^["'「『]+|["'」』]+$/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
    if (!title || isDefaultTitle(title)) return;
    chat.title = title;
    await api(`/api/chats/${chat.id}`, { method: "PUT", body: {
      title: chat.title, model: chat.model, params: chat.params, messages: chat.messages,
    }});
    loadChatList(chat.id);
  } catch { /* keep the provisional title */ } finally {
    clearTimeout(timer);
  }
}

$("#btnSend").addEventListener("click", sendChat);
$("#btnAbort").addEventListener("click", () => { if (state.abort) state.abort.abort(); });
$("#pgInput").addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  if (e.isComposing || e.keyCode === 229) return;  // don't send while the IME is converting
  if (e.shiftKey) return;  // Shift+Enter inserts a newline
  e.preventDefault();
  sendChat();
});

// ------------------------------------------------------------ init

let _booted = false;
async function boot() {
  try {
    await loadConfig();
    $("#btnLogout").classList.toggle("hidden", !state.cfg.ui_auth_enabled);
    await Promise.all([loadModels(), loadInstalled(), loadStatus(), loadChatList()]);
    if (state.cfg.update_check_enabled !== false) loadUpdate(false);
    if (!state.chat) {
      if (state.chats.length) await openChat(state.chats[0].id); else renderChat();
    }
  } catch (e) {
    if (e.message !== t("auth.login_required")) toast(e.message, true);
  }
  if (!_booted) {
    _booted = true;
    setInterval(() => { if (!document.hidden) loadTasks(); }, 900);
    setInterval(() => { if (!document.hidden) loadStatus(); }, 1500);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) { loadTasks(); loadStatus(); }  // catch up when the tab is shown again
    });
  }
  loadTasks();
}

(async function init() {
  applyI18n();
  try {
    const a = await api("/api/auth/state");
    state.auth = a;
    $("#btnLogout").classList.toggle("hidden", !a.enabled);
    if (a.enabled && !a.authenticated) { showLogin(); return; }
  } catch (e) {
    if (e.message === t("auth.login_required")) { showLogin(); return; }
  }
  boot();
})();
