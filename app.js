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
  centerLat: "",
  centerLng: "",
  radiusKm: "",
  missingGeoOnly: false,
  editingId: null,
};
let map;
let mapMarker;
let pickedLatLng = null;

const $ = (id) => document.getElementById(id);

function fullUrl(path) {
  return `${API_BASE}${path}`;
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
  if (!res.ok) throw new Error("ç”¨æˆ·åæˆ–å¯†ç é”™è¯¯");
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
    "country",
    "street",
    "city",
    "postcode",
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
}

function renderRows(items) {
  const tbody = $("customersTable").querySelector("tbody");
  tbody.innerHTML = "";
  for (const item of items) {
    const tr = document.createElement("tr");
    const canEdit = state.role === "admin" || state.role === "editor";
    const canDelete = state.role === "admin";
    tr.innerHTML = `
      <td>${item.id}</td>
      <td>${item.company_name || ""}</td>
      <td>${item.contact_name || ""}</td>
      <td>${item.phone || ""}</td>
      <td>${item.email || ""}</td>
      <td>${item.country || ""}</td>
      <td>${item.latitude ?? ""}</td>
      <td>${item.longitude ?? ""}</td>
      <td>${item.note || ""}</td>
      <td>${item.source_file || ""}</td>
      <td>
        <button data-id="${item.id}" data-act="edit" ${canEdit ? "" : "disabled"}>ç¼–è¾‘</button>
        <button data-id="${item.id}" data-act="del" class="secondary" ${canDelete ? "" : "disabled"}>åˆ é™¤</button>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

async function loadMeta() {
  const data = await api("/api/meta");
  const sel = $("countrySelect");
  sel.innerHTML = `<option value="">å…¨éƒ¨å›½å®¶</option>`;
  data.countries.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  });
}

async function loadData() {
  const qs = new URLSearchParams({
    page: String(state.page),
    page_size: String(state.pageSize),
  });
  if (state.search) qs.set("search", state.search);
  if (state.country) qs.set("country", state.country);
  if (state.missingGeoOnly) qs.set("missing_geo", "true");
  if (state.centerLat && state.centerLng && state.radiusKm) {
    qs.set("center_lat", state.centerLat);
    qs.set("center_lng", state.centerLng);
    qs.set("radius_km", state.radiusKm);
  }
  const data = await api(`/api/customers?${qs.toString()}`);
  state.total = data.total;
  renderRows(data.items);
  $("stats").textContent = `æ€»è®¡ ${data.total} æ¡`;
  const totalPages = Math.max(1, Math.ceil(data.total / state.pageSize));
  $("pageInfo").textContent = `ç¬¬ ${state.page} / ${totalPages} é¡µ`;
  $("prevBtn").disabled = state.page <= 1;
  $("nextBtn").disabled = state.page >= totalPages;
}

function bindEvents() {
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
    state.search = $("searchInput").value.trim();
    state.country = $("countrySelect").value;
    state.centerLat = $("centerLatInput").value.trim();
    state.centerLng = $("centerLngInput").value.trim();
    state.radiusKm = $("radiusKmInput").value.trim();
    state.missingGeoOnly = $("missingGeoOnlyInput").checked;
    state.page = 1;
    await loadData();
  };
  $("resetBtn").onclick = async () => {
    $("searchInput").value = "";
    $("countrySelect").value = "";
    $("centerLatInput").value = "";
    $("centerLngInput").value = "";
    $("radiusKmInput").value = "";
    $("missingGeoOnlyInput").checked = false;
    state.search = "";
    state.country = "";
    state.centerLat = "";
    state.centerLng = "";
    state.radiusKm = "";
    state.missingGeoOnly = false;
    state.page = 1;
    await loadData();
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
    $("dialogTitle").textContent = "æ–°å¢žå®¢æˆ·";
    fillForm(null);
    $("editorDialog").showModal();
  };
  $("geocodePageBtn").onclick = async () => {
    const ids = [...$("customersTable").querySelectorAll("tbody tr")]
      .map((tr) => Number(tr.children[0].textContent))
      .filter((x) => Number.isFinite(x) && x > 0);
    if (!ids.length) {
      alert("å½“å‰é¡µæ²¡æœ‰å¯å¤„ç†æ•°æ®");
      return;
    }
    if (!confirm(`å°†å°è¯•å®šä½å½“å‰é¡µ ${ids.length} æ¡å®¢æˆ·ï¼Œç»§ç»­ï¼Ÿ`)) return;
    const r = await api("/api/customers/geocode", {
      method: "POST",
      body: JSON.stringify({ ids, pause_sec: 0.8 }),
    });
    alert(`å®šä½å®Œæˆï¼šæ›´æ–° ${r.updated}ï¼Œæœªå‘½ä¸­ ${r.missed}ï¼Œé”™è¯¯ ${r.errors}`);
    await loadData();
  };

  $("geocodeFilteredBtn").onclick = async () => {
    const payload = {
      search: $("searchInput").value.trim() || null,
      country: $("countrySelect").value || null,
      missing_geo: $("missingGeoOnlyInput").checked,
      center_lat: $("centerLatInput").value.trim() ? Number($("centerLatInput").value.trim()) : null,
      center_lng: $("centerLngInput").value.trim() ? Number($("centerLngInput").value.trim()) : null,
      radius_km: $("radiusKmInput").value.trim() ? Number($("radiusKmInput").value.trim()) : null,
      max_rows: 1000,
      pause_sec: 0.8,
    };
    if (!confirm("?????????????? 1000 ??????")) return;
    const r = await api("/api/customers/geocode-filter", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    alert(`??????? ${r.selected}??? ${r.updated}???? ${r.missed}??? ${r.errors}`);
    await loadData();
  };

  $("customersTable").onclick = async (e) => {
    const btn = e.target.closest("button[data-id]");
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (btn.dataset.act === "edit") {
      const detail = await api(`/api/customers/${id}`);
      state.editingId = id;
      $("dialogTitle").textContent = "ç¼–è¾‘å®¢æˆ·";
      fillForm(detail.item);
      $("editorDialog").showModal();
    }
    if (btn.dataset.act === "del") {
      if (!confirm("ç¡®è®¤åˆ é™¤è¿™æ¡è®°å½•ï¼Ÿ")) return;
      await api(`/api/customers/${id}`, { method: "DELETE" });
      await loadData();
    }
  };

  $("editorForm").onsubmit = async (e) => {
    e.preventDefault();
    const payload = collectForm();
    if (!payload.company_name) {
      alert("å…¬å¸åç§°ä¸èƒ½ä¸ºç©º");
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

  $("openMapBtn").onclick = () => openMapDialog();
  $("mapCloseBtn").onclick = () => $("mapDialog").close();
  $("mapSearchBtn").onclick = async () => mapSearch();
  $("mapUseBtn").onclick = () => applyPickedLatLng();
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
    await loadMeta();
    await loadData();
  } catch {
    logout();
  }
}

bindEvents();
initApp();

function ensureMap() {
  if (map) return;
  map = L.map("mapCanvas").setView([52.52, 13.405], 4);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);
  map.on("click", (e) => {
    pickedLatLng = e.latlng;
    if (!mapMarker) mapMarker = L.marker(e.latlng).addTo(map);
    else mapMarker.setLatLng(e.latlng);
    $("mapHint").textContent = `å·²é€‰æ‹©: ${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}`;
  });
}

function openMapDialog() {
  $("mapDialog").showModal();
  ensureMap();
  setTimeout(() => map.invalidateSize(), 50);
  const lat = parseFloat($("editorForm").elements["latitude"].value);
  const lng = parseFloat($("editorForm").elements["longitude"].value);
  if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
    const ll = L.latLng(lat, lng);
    pickedLatLng = ll;
    if (!mapMarker) mapMarker = L.marker(ll).addTo(map);
    else mapMarker.setLatLng(ll);
    map.setView(ll, 12);
    $("mapHint").textContent = `å½“å‰åæ ‡: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }
}

async function mapSearch() {
  const q = $("mapSearchInput").value.trim();
  if (!q) return;
  const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`;
  const res = await fetch(u, { headers: { "Accept-Language": "en" } });
  const data = await res.json();
  if (!data.length) {
    alert("æœªæ‰¾åˆ°åœ°ç‚¹");
    return;
  }
  const lat = Number(data[0].lat);
  const lng = Number(data[0].lon);
  pickedLatLng = L.latLng(lat, lng);
  if (!mapMarker) mapMarker = L.marker(pickedLatLng).addTo(map);
  else mapMarker.setLatLng(pickedLatLng);
  map.setView(pickedLatLng, 13);
  $("mapHint").textContent = `æœç´¢ç»“æžœ: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

function applyPickedLatLng() {
  if (!pickedLatLng) return;
  $("editorForm").elements["latitude"].value = pickedLatLng.lat.toFixed(6);
  $("editorForm").elements["longitude"].value = pickedLatLng.lng.toFixed(6);
  $("mapDialog").close();
}

