const API_BASE = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL
  ? window.APP_CONFIG.API_BASE_URL
  : "").replace(/\/+$/, "");

const state = {
  token: localStorage.getItem("token") || "",
  role: localStorage.getItem("role") || "",
  username: localStorage.getItem("username") || "",
  page: 1,
  pageSize: 50,
  total: 0,
  search: "",
  country: "",
  nearText: "",
  centerLat: "",
  centerLng: "",
  radiusKm: "20",
  includeTrustDirect: false,
  editingId: null,
  commCustomerId: null,
};

const $ = (id) => document.getElementById(id);

function fullUrl(path) {
  return `${API_BASE}${path}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function api(path, options = {}) {
  const headers = options.headers || {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (!headers["Content-Type"] && options.body) headers["Content-Type"] = "application/json";
  const res = await fetch(fullUrl(path), { ...options, headers });
  if (res.status === 401) logout();
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = await res.json();
      if (j.detail) msg = j.detail;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("username");
  state.token = "";
  state.role = "";
  state.username = "";
  $("appPanel").classList.add("hidden");
  $("userBox").classList.add("hidden");
  $("loginPanel").classList.remove("hidden");
}

async function login() {
  const username = $("loginUser").value.trim();
  const password = $("loginPass").value;
  const body = new URLSearchParams();
  body.set("username", username);
  body.set("password", password);
  const res = await fetch(fullUrl("/api/auth/token"), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error("\u7528\u6237\u540d\u6216\u5bc6\u7801\u9519\u8bef");
  const data = await res.json();
  state.token = data.access_token;
  state.role = data.role;
  state.username = data.username;
  localStorage.setItem("token", state.token);
  localStorage.setItem("role", state.role);
  localStorage.setItem("username", state.username);
}

function collectForm() {
  const form = $("editorForm");
  const data = Object.fromEntries(new FormData(form).entries());
  data.source_row = data.source_row ? Number(data.source_row) : 0;
  data.latitude = data.latitude ? Number(data.latitude) : null;
  data.longitude = data.longitude ? Number(data.longitude) : null;
  data.match_score = data.match_score === "" ? null : Number(data.match_score);
  data.trust_direct_customer = !!form.elements["trust_direct_customer"].checked;
  return data;
}

function fillForm(item) {
  const form = $("editorForm");
  for (const k of [
    "company_name",
    "contact_name",
    "phone",
    "website",
    "email",
    "lead_source",
    "business_description",
    "country",
    "street",
    "city",
    "postcode",
    "match_score",
    "note",
    "location",
    "latitude",
    "longitude",
    "source_file",
    "sheet_name",
    "source_row",
  ]) {
    form.elements[k].value = item?.[k] ?? "";
  }
  form.elements["trust_direct_customer"].checked = !!item?.trust_direct_customer;
}

function renderRows(items) {
  const tbody = $("customersTable").querySelector("tbody");
  tbody.innerHTML = "";
  for (const item of items) {
    const tr = document.createElement("tr");
    const canEdit = state.role === "admin" || state.role === "editor";
    tr.innerHTML = `
      <td>${item.id}</td>
      <td>${item.company_name || ""}</td>
      <td>${item.contact_name || ""}</td>
      <td>${item.phone || ""}</td>
      <td>${item.email || ""}</td>
      <td>${item.match_score === null || item.match_score === undefined || item.match_score === "" ? "" : `${Number(item.match_score)}星`}</td>
      <td>${item.country_group || item.country || ""}</td>
      <td>${item.city || ""}</td>
      <td>${item.postcode || ""}</td>
      <td>${item.trust_direct_customer ? "是" : ""}</td>
      <td>${item.business_description || ""}</td>
      <td>${item.note || ""}</td>
      <td>${item.lead_source || ""}</td>
      <td>${item.source_file || ""}</td>
      <td>
        <button class="comm-btn no-record" data-id="${item.id}" data-act="comm">\u6c9f\u901a\u8bb0\u5f55</button>
        <button data-id="${item.id}" data-act="edit" ${canEdit ? "" : "disabled"}>\u7f16\u8f91</button>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

async function refreshCommunicationBadges(items) {
  const checks = items.map(async (item) => {
    try {
      const data = await api(`/api/customers/${item.id}/communications?limit=1`);
      return { id: item.id, has: (Number(data?.total || 0) > 0) };
    } catch {
      return { id: item.id, has: false };
    }
  });

  const results = await Promise.all(checks);
  for (const r of results) {
    const btn = document.querySelector(`button[data-act="comm"][data-id="${r.id}"]`);
    if (!btn) continue;
    btn.classList.toggle("has-record", !!r.has);
    btn.classList.toggle("no-record", !r.has);
  }
}

function refreshStickyOffsets() {
  const root = document.documentElement;
  const topPx = 8;
  const search = document.querySelector(".search-strip");
  const meta = document.querySelector(".meta");
  const searchH = search ? Math.ceil(search.getBoundingClientRect().height) : 0;
  const metaH = meta ? Math.ceil(meta.getBoundingClientRect().height) : 0;
  root.style.setProperty("--sticky-top", `${topPx}px`);
  root.style.setProperty("--sticky-search-h", `${searchH}px`);
  root.style.setProperty("--sticky-meta-h", `${metaH}px`);
}

async function loadMeta() {
  const data = await api("/api/meta");
  const sel = $("countrySelect");
  const cityHints = $("cityHints");
  sel.innerHTML = `<option value="">\u5168\u90e8\u56fd\u5bb6</option>`;
  data.countries.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  });

  cityHints.innerHTML = "";
  const hints = (data.place_hints && data.place_hints.length ? data.place_hints : data.cities) || [];
  hints.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v;
    cityHints.appendChild(opt);
  });
}

async function resolveCenterFromNear(nearText) {
  const countryRaw = ($("countrySelect").value || "").trim();
  const countryMap = {
    "德国": "Germany",
    "Deutschland": "Germany",
    "Germany": "Germany",
    "奥地利": "Austria",
    "Österreich": "Austria",
    "Austria": "Austria",
    "瑞士": "Switzerland",
    "Schweiz": "Switzerland",
    "Switzerland": "Switzerland",
  };
  const country = countryMap[countryRaw] || countryRaw || "";
  const qs = new URLSearchParams({ near: nearText });
  if (country) qs.set("country", country);
  const data = await api(`/api/geo/resolve?${qs.toString()}`);
  if (!data.found) return null;
  return { lat: Number(data.lat), lng: Number(data.lng) };
}

async function loadData() {
  const qs = new URLSearchParams({
    page: String(state.page),
    page_size: String(state.pageSize),
  });
  if (state.search) qs.set("search", state.search);
  if (state.country) qs.set("country", state.country);
  if (state.includeTrustDirect) qs.set("include_trust_direct", "true");
  if (state.centerLat && state.centerLng && state.radiusKm) {
    qs.set("center_lat", state.centerLat);
    qs.set("center_lng", state.centerLng);
    qs.set("radius_km", state.radiusKm);
  }
  const data = await api(`/api/customers?${qs.toString()}`);
  state.total = data.total;
  renderRows(data.items);
  refreshCommunicationBadges(data.items);
  let msg = `\u603b\u8ba1 ${data.total} \u6761`;
  if (state.nearText) {
    msg += ` | \u4f4d\u7f6e ${state.nearText} \u00b1 ${state.radiusKm} km`;
  }
  if (state.includeTrustDirect) {
    msg += " | 含Trust直接客户";
  }
  if (data.total === 0) {
    msg += " | \u672a\u627e\u5230\u5339\u914d\u5ba2\u6237";
  }
  $("stats").textContent = msg;
  const totalPages = Math.max(1, Math.ceil(data.total / state.pageSize));
  $("pageInfo").textContent = `\u7b2c ${state.page} / ${totalPages} \u9875`;
  $("prevBtn").disabled = state.page <= 1;
  $("nextBtn").disabled = state.page >= totalPages;
  refreshStickyOffsets();
  return data;
}

function bindEvents() {
  window.addEventListener("resize", refreshStickyOffsets);

  $("loginBtn").onclick = async () => {
    try {
      await login();
      await initApp();
    } catch (e) {
      alert(e.message);
    }
  };

  $("logoutBtn").onclick = () => logout();

  $("searchBtn").onclick = async () => {
    try {
      $("stats").textContent = "\u6b63\u5728\u641c\u7d22...";
      state.search = $("searchInput").value.trim();
      state.country = $("countrySelect").value;
      state.nearText = $("nearInput").value.trim();
      state.radiusKm = $("radiusKmSelect").value || "20";
      state.includeTrustDirect = $("includeTrustDirectInput").checked;

      state.centerLat = "";
      state.centerLng = "";
      if (state.nearText) {
        const p = await resolveCenterFromNear(state.nearText);
        if (!p) {
          $("stats").textContent = "\u672a\u627e\u5230\u4f4d\u7f6e\uff0c\u8bf7\u6362\u4e2a\u5173\u952e\u8bcd";
          alert("\u672a\u627e\u5230\u4f4d\u7f6e\uff0c\u8bf7\u6362\u4e2a\u5173\u952e\u8bcd");
          return;
        }
        state.centerLat = String(p.lat);
        state.centerLng = String(p.lng);
      }

      state.page = 1;
      await loadData();
    } catch (e) {
      $("stats").textContent = `\u641c\u7d22\u5931\u8d25: ${e.message || e}`;
      alert(`\u641c\u7d22\u5931\u8d25: ${e.message || e}`);
    }
  };

  $("resetBtn").onclick = async () => {
    $("searchInput").value = "";
    $("countrySelect").value = "";
    $("nearInput").value = "";
    $("radiusKmSelect").value = "20";
    $("includeTrustDirectInput").checked = false;
    state.search = "";
    state.country = "";
    state.nearText = "";
    state.centerLat = "";
    state.centerLng = "";
    state.radiusKm = "20";
    state.includeTrustDirect = false;
    state.page = 1;
    await loadData();
  };

  $("includeTrustDirectInput").onchange = async () => {
    try {
      $("stats").textContent = "正在搜索...";
      state.includeTrustDirect = $("includeTrustDirectInput").checked;
      state.page = 1;
      await loadData();
    } catch (e) {
      $("stats").textContent = `搜索失败: ${e.message || e}`;
      alert(`搜索失败: ${e.message || e}`);
    }
  };

  $("prevBtn").onclick = async () => {
    if (state.page > 1) {
      state.page--;
      await loadData();
    }
  };

  $("nextBtn").onclick = async () => {
    const totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
    if (state.page < totalPages) {
      state.page++;
      await loadData();
    }
  };

  $("addBtn").onclick = () => {
    state.editingId = null;
    $("dialogTitle").textContent = "\u65b0\u589e\u5ba2\u6237";
    fillForm(null);
    $("editorDialog").showModal();
  };

  $("customersTable").onclick = async (e) => {
    const btn = e.target.closest("button[data-id]");
    if (!btn) return;
    const id = Number(btn.dataset.id);

    if (btn.dataset.act === "comm") {
      await openCommDialog(id);
      return;
    }

    if (btn.dataset.act === "edit") {
      const detail = await api(`/api/customers/${id}`);
      state.editingId = id;
      $("dialogTitle").textContent = "\u7f16\u8f91\u5ba2\u6237";
      fillForm(detail.item);
      $("editorDialog").showModal();
      return;
    }

  };

  $("editorForm").onsubmit = async (e) => {
    e.preventDefault();
    const payload = collectForm();
    if (!payload.company_name) {
      alert("\u516c\u53f8\u540d\u79f0\u4e0d\u80fd\u4e3a\u7a7a");
      return;
    }
    if (state.editingId) {
      await api(`/api/customers/${state.editingId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    } else {
      await api("/api/customers", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }
    $("editorDialog").close();
    await loadData();
  };

  $("commCloseBtn").onclick = () => $("commDialog").close();
  $("commForm").onsubmit = async (e) => {
    e.preventDefault();
    if (!state.commCustomerId) return;
    const payload = {
      channel: $("commChannel").value.trim() || null,
      contact_name: $("commContact").value.trim() || null,
      subject: $("commSubject").value.trim() || null,
      content: $("commContent").value.trim() || null,
      happened_at: $("commHappenedAt").value.trim() || null,
      next_follow_up_at: $("commFollowUpAt").value.trim() || null,
    };
    if (!payload.subject && !payload.content) {
      alert("\u8bf7\u586b\u5199\u4e3b\u9898\u6216\u5185\u5bb9");
      return;
    }
    await api(`/api/customers/${state.commCustomerId}/communications`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    $("commSubject").value = "";
    $("commContent").value = "";
    $("commFollowUpAt").value = "";
    await loadCommunications();
  };
}

async function openCommDialog(customerId) {
  state.commCustomerId = customerId;
  const detail = await api(`/api/customers/${customerId}`);
  const title = detail?.item?.company_name || `#${customerId}`;
  $("commTitle").textContent = `\u5ba2\u6237\u6c9f\u901a\u8bb0\u5f55 - ${title}`;
  if (!$("commHappenedAt").value) {
    $("commHappenedAt").value = new Date().toISOString().slice(0, 19);
  }
  $("commDialog").showModal();
  await loadCommunications();
}

function renderCommunications(items) {
  const box = $("commList");
  if (!items.length) {
    box.innerHTML = `<div class="hint">\u6682\u65e0\u8bb0\u5f55</div>`;
    return;
  }
  box.innerHTML = items
    .map(
      (r) => `
      <article class="comm-item">
        <div class="comm-head">
          <strong>${escapeHtml(r.subject || "(no subject)")}</strong>
          <span>${escapeHtml(r.happened_at || "")}</span>
        </div>
        <div class="comm-meta">
          <span>channel: ${escapeHtml(r.channel || "-")}</span>
          <span>contact: ${escapeHtml(r.contact_name || "-")}</span>
          <span>by: ${escapeHtml(r.created_by || "-")}</span>
          <span>next: ${escapeHtml(r.next_follow_up_at || "-")}</span>
        </div>
        <div class="comm-content">${escapeHtml(r.content || "")}</div>
      </article>
    `
    )
    .join("");
}

async function loadCommunications() {
  if (!state.commCustomerId) return;
  const data = await api(`/api/customers/${state.commCustomerId}/communications?limit=200`);
  renderCommunications(data.items || []);
}

async function initApp() {
  if (!state.token) {
    logout();
    return;
  }
  try {
    const me = await api("/api/auth/me");
    state.username = me.username;
    state.role = me.role;
    $("userLabel").textContent = `${state.username} (${state.role})`;
    $("loginPanel").classList.add("hidden");
    $("appPanel").classList.remove("hidden");
    $("userBox").classList.remove("hidden");
    $("addBtn").disabled = !(state.role === "admin" || state.role === "editor");
    refreshStickyOffsets();
    await loadMeta();
    await loadData();
    requestAnimationFrame(refreshStickyOffsets);
    setTimeout(refreshStickyOffsets, 120);
  } catch {
    logout();
  }
}

bindEvents();
initApp();
