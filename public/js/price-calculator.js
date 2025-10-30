const backendUrl = "/api";
const crateSidebar = document.getElementById("crateSidebar");
const accRoot = document.getElementById("accRoot");
const preloader = document.getElementById("preloader");
const searchInput = document.getElementById("searchInput");

let allCrates = [];
let currentCrate = null;
let selectedEconomy = "Phoenix";
let currentItem = null;
let searchTerm = "";
let currentSearch = "";
let PC_ME = null;

// ================== UTILITIES ==================
function prettyCrateName(name) {
  return (name || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function escapeHtml(s) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(s ?? "").replace(/[&<>"']/g, ch => map[ch]);
}

function hidePreloader() {
  if (!preloader) return;
  preloader.style.opacity = "0";
  preloader.style.transition = "opacity 0.6s ease";
  setTimeout(() => (preloader.style.display = "none"), 600);
}

function redirectHome() {
  location.replace("/");
}

async function pcFetchMe() {
  try {
    const r = await fetch(`${backendUrl}/me`, { credentials: "include" });
    PC_ME = r.ok ? await r.json() : null;
  } catch {
    PC_ME = null;
  }
}

function isActiveMute(expiresAt) {
  if (expiresAt === null) return true;
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  return Number.isFinite(t) && t > Date.now();
}

function fmtDelta(ms) {
  if (ms <= 0) return "0s";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d)  return `${d}d ${h}h`;
  if (h)  return `${h}h ${m}m`;
  if (m)  return `${m}m ${sec}s`;
  return `${sec}s`;
}

function pcShort(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  const ax = Math.abs(x);

  const trim = (s) => s.replace(/\.0+$|(\.\d*[1-9])0+$/, "$1");

  if (ax >= 1_000_000) {
    const s = (x / 1_000_000).toFixed(2);
    return trim(s) + "m";
  }
  if (ax >= 1_000) {
    const s = (x / 1_000).toFixed(1);
    return trim(s) + "k";
  }
  return String(Math.trunc(x));
}

function isLinkedAccount() {
  return !!(PC_ME && typeof PC_ME.minecraft_username === "string" && PC_ME.minecraft_username.trim());
}

function updateCommentGateUI() {
  const box = document.getElementById("commentBox");
  const btn = document.getElementById("submitComment");
  const wrap = box?.closest('.comment-input');
  if (!box || !btn || !wrap) return;

  const mutedOv = wrap.querySelector('.comment-mute-overlay');
  if (mutedOv) {
    box.disabled = true;
    btn.disabled = true;
    return;
  }

  const linked = isLinkedAccount();

  box.disabled = !linked;
  btn.disabled = !linked;
  box.placeholder = linked
    ? "Write a comment… (max 250 chars)"
    : "";

  // overlay banner (one-per page)
  let ov = wrap.querySelector(".gate-overlay");
  if (!linked) {
    if (!ov) {
      ov = document.createElement("div");
      ov.className = "gate-overlay";
      ov.innerHTML = `<span>Sign in & link your Minecraft account to comment.</span>`;
      wrap.appendChild(ov);
    }
  } else if (ov && !ov.classList.contains('comment-mute-overlay')) {
    // Do not remove the mute overlay; only remove the unlinked overlay
    ov.remove();
  }
}

async function applyCommentMuteGate() {
  // Only meaningful for signed-in, MC-linked users
  if (!PC_ME || !isLinkedAccount()) return;

  const box = document.getElementById("commentBox");
  const btn = document.getElementById("submitComment");
  const wrap = box?.closest(".comment-input");
  if (!box || !btn || !wrap) return;

  // Fetch mute status for the *current* user, bypassing HTTP 304 cache
  let data = null;
  try {
    const r = await fetch(`${backendUrl}/comment-mute/me`, {
      credentials: "include"
    });
    if (r.ok) data = await r.json();
  } catch {}

  // Clean previous artifacts
  if (box._muteTimer) { clearInterval(box._muteTimer); box._muteTimer = null; }
  wrap.querySelectorAll(".comment-mute-overlay").forEach(n => n.remove());

  // --- Normalize API keys (supports either snake_case or camelCase) ---
  const isMuted       = data?.is_muted ?? data?.muted ?? false;
  const expiresAt     = data?.expires_at ?? data?.expiresAt ?? null;
  const durationHours = data?.duration_hours ?? data?.durationHours ?? null;
  const reason        = data?.reason ?? "";

  // Not muted → let the normal gate handle linked/unlinked
  if (!isMuted) {
    updateCommentGateUI();
    return;
  }

  // Build overlay (reuses your base .gate-overlay box + mute styling)
  const ov = document.createElement("div");
  ov.className = "gate-overlay comment-mute-overlay";

  const indefinite = (expiresAt === null);

  let displayHours = durationHours;
  if (!indefinite && (displayHours == null)) {
    const msLeft = new Date(expiresAt).getTime() - Date.now();
    const approxHours = Math.round(msLeft / 3600000);
    displayHours = approxHours >= 23 ? 24 : 1;
  }

  const titleHtml = indefinite
    ? "You've been indefinitely muted by administrators."
    : `You've been muted by administrators for ${displayHours === 24 ? 24 : 1} hour${displayHours === 1 ? "" : "s"}.`;

  const countdown  = !indefinite ? `<div>Mute will expire in: <span class="eta">—</span></div>` : "";
  const untilLine  = (!indefinite && expiresAt)
      ? `<div style="margin-top:4px">Unmutes: ${new Date(expiresAt).toLocaleString()}</div>` : "";
  const reasonLine = reason ? `<div style="margin-top:6px">Reason: ${escapeHtml(reason)}</div>` : "";

  ov.innerHTML = `
    <div class="comment-mute-overlay-inner">
      <div style="font-weight:600;margin-bottom:6px">${titleHtml}</div>
      ${countdown}
      ${untilLine}
      ${reasonLine}
    </div>
  `;
  wrap.appendChild(ov);

  // Hard-lock inputs
  box.disabled = true;
  btn.disabled = true;
  box.placeholder = "";

  // Live countdown for temporary mutes
  if (!indefinite && expiresAt) {
    const tgt = new Date(expiresAt).getTime();
    const etaEl = ov.querySelector(".eta");

    const tick = () => {
      const left = tgt - Date.now();
      if (left <= 0) {
        if (etaEl) etaEl.textContent = "now";
        clearInterval(box._muteTimer);
        // Re-check to clear overlay when mute ends
        applyCommentMuteGate();
        return;
      }
      const s   = Math.floor(left / 1000);
      const h   = Math.floor(s / 3600);
      const m   = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      if (etaEl) etaEl.textContent = h ? `${h}h ${m}m` : (m ? `${m}m ${sec}s` : `${sec}s`);
    };

    tick();
    box._muteTimer = setInterval(tick, 1000);
  }
}

// ===== Price Calculator Disclaimer =====
function pcDisclaimerKey() {
  // Scope preference per user when logged in; "guest" otherwise
  const uid = PC_ME?.id != null ? String(PC_ME.id) : "guest";
  return `ssc:pc-disclaimer:v1:${uid}`;
}

function maybeShowPriceDisclaimer() {
  try {
    if (localStorage.getItem(pcDisclaimerKey()) === "hide") return;
  } catch {}
  openPriceDisclaimerModal();
}

function openPriceDisclaimerModal() {
  const id  = "modal-pc-disclaimer";
  const key = pcDisclaimerKey();
  const seconds = 5;

  const message = `
    <div class="pc-disclaimer" style="text-align:left;line-height:1.5">
      <p style="margin:0 0 10px 0">
        <b>Important:</b> This Price Calculator provides <i>rough estimates</i> of
        typical item values by economy. It does <b>not</b> set defined prices.
      </p>
      <p style="margin:0 0 10px 0">
        YooEm and FleaMeKnee are <b>not responsible</b> for the values shown or for any
        in-game transactions that may occur based on those values. Use this tool solely
        as a general reference.
      </p>

      <label style="display:flex;gap:10px;align-items:flex-start;margin:10px 0;">
        <input id="pc-ack" type="checkbox" style="margin-top:3px">
        <span>I understand that values are estimates, not official prices, and I accept the notice above.</span>
      </label>

      <label style="display:flex;gap:10px;align-items:flex-start;margin:6px 0;">
        <input id="pc-nomore" type="checkbox" style="margin-top:3px">
        <span>Do not show this notice again on this device${PC_ME?.id ? " for my account" : ""}.</span>
      </label>

      <div id="pc-count" style="margin-top:8px;opacity:.9">
        You can proceed in <b id="pc-ct">${seconds}</b>s
      </div>
    </div>
  `;

  showGlobalModal({
    type: "info",
    title: "Price Calculator — Notice",
    message,
    buttons: [
      { label: "Close", onClick: `pcAcceptDisclaimer('${id}','${key}')` },
      { label: "Proceed", onClick: `pcAcceptDisclaimer('${id}','${key}')` }
    ],
    id
  });

  // Post-render: gate buttons until both ack + countdown complete
  setTimeout(() => {
    const root = document.getElementById(id);
    if (!root) return;

    // Grab the two footer buttons (Close, Proceed) in order
    const btns = Array.from(root.querySelectorAll("button"));
    const closeBtn   = btns[btns.length - 2];
    const proceedBtn = btns[btns.length - 1];

    const ackEl  = root.querySelector("#pc-ack");
    const stopEl = root.querySelector("#pc-nomore");
    const ctEl   = root.querySelector("#pc-ct");

    let remain = seconds;
    let unlocked = false;

    const updateEnabled = () => {
      const ack = !!ackEl?.checked;
      const ready = ack && remain === 0;
      closeBtn.disabled = !ready;
      proceedBtn.disabled = !ready;
      unlocked = ready;
    };

    // initial disabled state
    updateEnabled();

    // countdown
    const tick = () => {
      remain = Math.max(0, remain - 1);
      if (ctEl) ctEl.textContent = String(remain);
      updateEnabled();
      if (remain === 0) clearInterval(tmr);
    };
    const tmr = setInterval(tick, 1000);

    // enable when user acknowledges
    ackEl?.addEventListener("change", updateEnabled);

    // Save a small hook for the handler to read the "do not show again" checkbox
    root._pcNoMoreChecked = () => !!stopEl?.checked;
  }, 0);
}

// Called by both buttons after countdown + checkbox unlock
window.pcAcceptDisclaimer = function(modalId, storeKey) {
  const root = document.getElementById(modalId);
  if (root?._pcNoMoreChecked && root._pcNoMoreChecked()) {
    try { localStorage.setItem(storeKey, "hide"); } catch {}
  }
  if (typeof fadeOutAndRemove === "function") {
    fadeOutAndRemove(modalId);
  } else {
    // fallback
    root?.remove();
  }
};

function pcFormatCoins(n){ return (Number.isFinite(n) ? n.toLocaleString() : "—"); }

// ================== AUTH & INIT ==================
(async function init() {
  try {
    const res = await fetch(`${backendUrl}/me`, { credentials: "include" });
    if (!res.ok) return redirectHome();
    const user = await res.json();
    PC_ME = user;
    if (user.role !== "Admin" && user.role !== "SysAdmin") return redirectHome();

    document.body.hidden = false;
    maybeShowPriceDisclaimer();
    await loadCrates();
  } catch (err) {
    console.error("Initialization failed:", err);
    redirectHome();
  } finally {
    hidePreloader();
  }
})();

// ================== LOAD CRATES ==================
async function loadCrates() {
  try {
    // Fetch both crate categories in parallel
    const [cosmeticRes, nonCosmeticRes] = await Promise.all([
      fetch(`${backendUrl}/crates/cosmetic`, { credentials: "include" }),
      fetch(`${backendUrl}/crates/noncosmetic`, { credentials: "include" })
    ]);

    if (!cosmeticRes.ok || !nonCosmeticRes.ok)
      throw new Error("Failed to load crates");

    const [cosmeticCrates, nonCosmeticCrates] = await Promise.all([
      cosmeticRes.json(),
      nonCosmeticRes.json()
    ]);

    // Combine for shared reference but still categorize in renderSidebar
    allCrates = [...cosmeticCrates, ...nonCosmeticCrates];

    renderSidebar({
      cosmetic: cosmeticCrates,
      noncosmetic: nonCosmeticCrates
    });
  } catch (err) {
    console.error("Error loading crates:", err);
  }
}

// ================== SIDEBAR ==================
function renderSidebar(groups) {
  crateSidebar.innerHTML = "";

  const cosmeticSection = document.createElement("div");
  cosmeticSection.className = "crate-section";
  cosmeticSection.innerHTML = `<div class="pc-section-title">COSMETIC CRATES</div>`;
  cosmeticSection.appendChild(makeCrateGroup(groups.cosmetic));

  const otherSection = document.createElement("div");
  otherSection.className = "crate-section";
  otherSection.innerHTML = `<div class="pc-section-title">OTHER CRATES</div>`;
  otherSection.appendChild(makeCrateGroup(groups.noncosmetic));

  crateSidebar.appendChild(cosmeticSection);
  crateSidebar.appendChild(otherSection);
}


function makeCrateGroup(list) {
  const group = document.createElement("div");
  group.className = "crate-group";

  list.forEach(crate => {
    const btn = document.createElement("button");
    btn.className = "crate-btn";
    btn.textContent = prettyCrateName(crate.crate_name);

    btn.addEventListener("click", async () => {
      crateSidebar.querySelectorAll(".crate-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      document.getElementById("crateTitle").textContent = prettyCrateName(crate.crate_name);
      document.getElementById("crateCount").textContent = "Loading items...";

      const items = await loadItems(crate.id);
      crate.items = items;
      currentCrate = crate;

      document.getElementById("crateCount").textContent = `${crate.items.length} items`;
      renderItemsAsAccordions(crate);
    });

    group.appendChild(btn);
  });

  return group;
}

async function loadItems(crateId) {
  const res = await fetch(`${backendUrl}/crates/${crateId}/items`, {
    credentials: "include",
  });
  if (!res.ok) return [];
  return await res.json();
}

// ================== SEARCH (Enhanced) ==================
searchInput.addEventListener("input", (e) => {
  currentSearch = e.target.value.trim().toLowerCase();

  if (currentCrate) {
    renderItemsAsAccordions(currentCrate);
    if (currentSearch) {
      setTimeout(() => focusFirstSearchHit(currentSearch), 100);
    }
  }
});

function focusFirstSearchHit(term) {
  const accItems = accRoot.querySelectorAll(".acc-item");

  for (const acc of accItems) {
    const rows = acc.querySelectorAll("tbody tr");

    for (const row of rows) {
      const name = row.querySelector("td")?.textContent?.toLowerCase() || "";
      if (name.includes(term)) {
        // Open this accordion if it's closed
        const btn = acc.querySelector(".acc-btn");
        const panel = acc.querySelector(".acc-panel");
        if (!panel.classList.contains("open")) {
          togglePanel(panel, btn);
        }

        // Scroll to the row smoothly once accordion is open
        setTimeout(() => {
          row.scrollIntoView({ behavior: "smooth", block: "center" });

          // Highlight the found row
          row.classList.add("search-hit");
          setTimeout(() => row.classList.remove("search-hit"), 1200);
        }, 250);

        return; // Stop after first match
      }
    }
  }
}

// Add highlight CSS dynamically
const style = document.createElement("style");
style.textContent = `
  .search-hit {
    background: rgba(54, 92, 245, 0.25) !important;
    transition: background 0.4s ease;
  }
`;
document.head.appendChild(style);

// ================== ACCORDION RENDERING ==================
function renderItemsAsAccordions(crate) {
  accRoot.innerHTML = "";

  if (!crate.items || !crate.items.length) {
    accRoot.innerHTML = "<p>No items found for this crate.</p>";
    return;
  }

  const groups = crate.items.reduce((acc, it) => {
    const key = it.set_name || "Unknown";
    (acc[key] ||= []).push(it);
    return acc;
  }, {});
  const setNames = Object.keys(groups).sort((a, b) => a.localeCompare(b));

  setNames.forEach((setName) => {
    const items = groups[setName].slice().sort((a, b) =>
      a.item_name.localeCompare(b.item_name)
    );

    const wrap = document.createElement("div");
    wrap.className = "acc-item";
    wrap.innerHTML = `
      <button class="acc-btn" type="button">
        <span class="acc-title">${setName}</span>
        <span class="acc-count">Total items: ${items.length}</span>
        <span class="acc-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
        </span>
      </button>
      <div class="acc-panel">
        <div class="acc-panel-inner">
          <table class="acc-table">
            <thead>
              <tr>
                <th>Item Name</th>
                <th>Item Set</th>
                <th>Icon</th>
                <th>Value</th> <!-- added header for 💰 column -->
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    const btn = wrap.querySelector(".acc-btn");
    const panel = wrap.querySelector(".acc-panel");
    const tbody = wrap.querySelector("tbody");
    btn.addEventListener("click", () => togglePanel(panel, btn));

    items.forEach((it) => {
      const matches =
        !searchTerm || it.item_name.toLowerCase().includes(searchTerm);
      if (!matches) return;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="item-name-cell">
          ${it.item_name}
          ${it.tooltip ? `<span class="info-icon" data-tooltip="${it.tooltip.replace(/^"+|"+$/g, "")}">🛈</span>` : ""}
        </td>
        <td>${it.set_name || ""}</td>
        <td>${
          it.icon_url
            ? `<img src="${it.icon_url}" alt="${it.item_name}" />`
            : ""
        }</td>
        <td><button class="money-btn" data-item-id="${it.id}" title="View Price">💰</button></td>
      `;
      tbody.appendChild(tr);
    });

    accRoot.appendChild(wrap);
  });

  accRoot.querySelectorAll(".money-btn").forEach((btn) =>
    btn.addEventListener("click", () => openModal(btn.dataset.itemId))
  );
}

function togglePanel(panel, btn) {
  const isOpen = panel.classList.contains("open");
  document.querySelectorAll(".acc-panel.open").forEach((p) => {
    p.classList.remove("open");
    p.style.maxHeight = null;
    p.previousElementSibling?.classList.remove("active");
  });
  if (!isOpen) {
    panel.classList.add("open");
    panel.style.maxHeight = panel.scrollHeight + "px";
    btn.classList.add("active");
  }
}

// ================== MODAL ==================
async function openModal(itemId) {
  const modal = document.getElementById("priceModal");
  const res = await fetch(`${backendUrl}/prices/${itemId}`, { credentials: "include" });
  const item = await res.json();
  currentItem = item;

  // === Header info ===
  document.getElementById("itemName").textContent = item.item_name || "Item";
  document.getElementById("itemSet").textContent = item.set_name || "";
  document.getElementById("itemIcon").src = item.icon_url || "/assets/default_icon.png";

  // === Economy visibility ===
  const isCerb = (item.crate_name || "").toLowerCase().includes("cerberus");
  document.getElementById("cerberusBtn").style.display = isCerb ? "inline-block" : "none";
  ["phoenixBtn","lynxBtn","wyvernBtn"].forEach(id =>
    document.getElementById(id).style.display = isCerb ? "none" : "inline-block"
  );
  if (isCerb) selectedEconomy = "Cerberus";
  else if (selectedEconomy === "Cerberus") selectedEconomy = "Phoenix";

  updateEconomyDisplay();
  await loadInsights(itemId);
  await loadComments(itemId);

  await pcFetchMe();
  await applyCommentMuteGate();
  updateCommentGateUI();

  attachPriceEditors();

  modal.classList.remove("hidden");
  requestAnimationFrame(() => {
    modal.classList.add("show");
    setTimeout(() => { applyCommentMuteGate(); }, 0);
  });

  modal.querySelectorAll(".close-btn").forEach(btn =>
    btn.onclick = () => closeModal(modal)
  );
}

function closeModal(modal) {
  modal.classList.remove("show");
  setTimeout(() => modal.classList.add("hidden"), 300);
}

// ================== ECONOMY ==================
function updateEconomyDisplay() {
  const baseEl = document.getElementById("baseValue");
  const maxEl  = document.getElementById("maxValue");
  const avgEl  = document.getElementById("avgValue");
  const it = currentItem || {};
  let baseVal, maxVal;

  switch (selectedEconomy) {
    case "Phoenix":  [baseVal, maxVal] = [it.px_base_value, it.px_max_value]; break;
    case "Lynx":     [baseVal, maxVal] = [it.lx_base_value, it.lx_max_value]; break;
    case "Wyvern":   [baseVal, maxVal] = [it.wyv_base_value, it.wyv_max_value]; break;
    case "Cerberus": [baseVal, maxVal] = [it.cb_base_value, it.cb_max_value]; break;
  }

  const hasBase = baseVal !== null && baseVal !== undefined;
  const hasMax  = maxVal  !== null && maxVal  !== undefined;

  baseEl.textContent = hasBase ? pcShort(baseVal) : "—";
  maxEl.textContent  = hasMax  ? pcShort(maxVal)  : "—";

  if (hasBase && hasMax) {
    const avg = (+baseVal + +maxVal) / 2;
    avgEl.textContent = pcShort(avg);
  } else {
    avgEl.textContent = "—";
  }

  highlightEconomy();
}

function highlightEconomy() {
  document.querySelectorAll(".econ-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.econ === selectedEconomy);
  });
}

function getCurrentEconomyValues() {
  const it = currentItem || {};
  switch (selectedEconomy) {
    case "Phoenix":  return { base: +it.px_base_value || 0, max: +it.px_max_value || 0 };
    case "Lynx":     return { base: +it.lx_base_value || 0, max: +it.lx_max_value || 0 };
    case "Wyvern":   return { base: +it.wyv_base_value || 0, max: +it.wyv_max_value || 0 };
    case "Cerberus": return { base: +it.cb_base_value || 0, max: +it.cb_max_value || 0 };
    default:         return { base: 0, max: 0 };
  }
}

function attachPriceEditors() {
  // Only Admin/SysAdmin and only when modal is open with currentItem
  if (!PC_ME || !currentItem || !["Admin","SysAdmin"].includes(PC_ME.role)) return;

  const cards = document.querySelectorAll(".price-values > div");
  if (!cards || cards.length < 3) return;

  const targets = [
    { el: cards[0], field: "base", title: "Edit Min (Base)" },
    { el: cards[2], field: "max",  title: "Edit Max" }
  ];

  targets.forEach(({ el, field, title }) => {
    if (el.querySelector(".price-edit-btn")) return;

    el.style.position = "relative";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "price-edit-btn";
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.style.cssText = `
      position:absolute; top:6px; right:8px; z-index:2;
      background:transparent; border:0; padding:0; cursor:pointer;
      opacity:0; color:#a9b3d6;
      transition: opacity .15s ease, color .15s ease;
    `;
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="display:block">
        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/>
      </svg>
    `;
    el.appendChild(btn);

    // show/hide on card hover
    el.addEventListener("mouseenter", () => { btn.style.opacity = "1"; });
    el.addEventListener("mouseleave", () => { btn.style.opacity = "0"; });

    // pencil color transition on icon hover
    btn.addEventListener("mouseenter", () => { btn.style.color = "#e6edff"; });
    btn.addEventListener("mouseleave", () => { btn.style.color = "#a9b3d6"; });

    btn.addEventListener("click", () => openPriceEditModal(field));
  });
}

document.querySelectorAll(".econ-btn").forEach((btn) =>
  btn.addEventListener("click", () => {
    const econ = btn.dataset.econ;
    if (econ === "Cerberus" && btn.style.display === "none") return;
    selectedEconomy = econ;
    updateEconomyDisplay();
    if (currentItem?.id) {
      loadComments(currentItem.id);
      loadInsights(currentItem.id);
    }
    applyCommentMuteGate();
    attachPriceEditors();
  })
);

function renderEconTag(e) {
  if (!e) return "";
  const econ = String(e).toLowerCase();
  const cls  = {
    phoenix: "econ-phoenix",
    lynx: "econ-lynx",
    wyvern: "econ-wyvern",
    cerberus: "econ-cerberus"
  }[econ] || "econ-phoenix";
  const label = e.charAt(0).toUpperCase() + e.slice(1);
  return ` <span class="econ-tag ${cls}">[${label}]</span>`;
}

function renderName(c) {
  const hasMC = !!c.minecraft_username;
  const name  = hasMC ? `${c.username} (${c.minecraft_username})` : c.username;
  const badge = hasMC ? ' <span class="verified-badge" title="Verified">✔</span>' : '';
  // Attach the economy tag from the comment record
  const tag   = renderEconTag(c.economy);
  return name + badge + tag;
}

// ================== COMMENTS ==================

const SVG = {
  verify: `
    <svg class="icon icon-verify" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor"
        d="M12 2l6 2.7v6.1c0 4.3-3 8.2-6 9.2-3-1-6-4.9-6-9.2V4.7L12 2zm-1 13l6-6-1.4-1.4L11 12.2 8.4 9.6 7 11l4 4z" />
    </svg>
  `,
  trash: `
    <svg class="icon icon-trash" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor"
        d="M9 3h6a1 1 0 0 1 1 1v1h4v2H4V5h4V4a1 1 0 0 1 1-1zm-3 6h12l-1 11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 9zm5 2v8h2v-8h-2z" />
    </svg>
  `,
  mute: `
    <svg class="icon icon-mute" viewBox="0 0 24 24" aria-hidden="true">
      <!-- Speaker -->
      <path d="M11 5L7 9H4v6h3l4 4V5z" fill="currentColor"/>
      <!-- X -->
      <path d="M18.5 9.5l-1-1-2 2-2-2-1 1 2 2-2 2 1 1 2-2 2 2 1-1-2-2 2-2z" fill="currentColor"/>
    </svg>
  `,
};

async function loadComments(itemId) {
  const res = await fetch(`${backendUrl}/comments?itemId=${itemId}`, { credentials: "include" });
  PC_COMMENTS_CACHE = await res.json();
  PC_COMMENTS_PAGE  = 1;
  renderCommentsPaged();
}

function renderCommentsPaged() {
  const list = document.getElementById("commentList");
  if (!list) return;

  list.innerHTML = "";

  const isAdmin = !!(PC_ME && (PC_ME.role === "Admin" || PC_ME.role === "SysAdmin"));

  if (!PC_COMMENTS_CACHE.length) {
    list.innerHTML = "<p>No comments yet.</p>";
    renderCommentPagination(1, 1); // still draw a minimal footer
    return;
  }

  const { slice, page, totalPages } = paginate(PC_COMMENTS_CACHE, PC_COMMENTS_PAGE, COMMENTS_PER_PAGE);
  PC_COMMENTS_PAGE = page; // normalize/clamp

  slice.forEach(c => {
    const wrapper = document.createElement("div");
    wrapper.className = "comment-entry";
    wrapper.dataset.commentId = c.id;

    const date = new Date(c.created_at);
    const timestamp = date.toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit"
    });

    const isAdmin = !!(PC_ME && (PC_ME.role === "Admin" || PC_ME.role === "SysAdmin"));
    const targetRole = c.user_role || "";
    const isMuted = !!c.is_muted;

    const ignSpan = c.minecraft_username
      ? `<span class="mc-tag">IGN: ${escapeHtml(c.minecraft_username)} ${SVG.verify}</span>`
      : "";

    const mutedBadge = (isAdmin && isMuted)
      ? `<span class="muted-badge" title="${
           c.mute_expires_at
             ? `Muted until ${new Date(c.mute_expires_at).toLocaleString()}`
             : 'Muted indefinitely'
         }">
           ${SVG.mute}<span>Muted</span>
         </span>`
      : "";

    wrapper.innerHTML = `
      <div class="comment-line">
        ${mutedBadge}
        <b>${escapeHtml(c.username)}</b>
        ${ignSpan}
        <span class="econ-tag econ-${c.economy.toLowerCase()}">${escapeHtml(c.economy)}</span>
        <span class="comment-text">– ${escapeHtml(c.comment)}</span>
      </div>
      <small>${timestamp}</small>
      ${isAdmin ? `
        <button class="comment-mute" title="Mute options"
                data-user-id="${c.user_id}"
                data-user-role="${escapeHtml(targetRole)}"
                data-username="${escapeHtml(c.username)}"
                data-mc="${escapeHtml(c.minecraft_username || '')}"
                data-active="${isMuted ? '1' : '0'}"
                data-reason="${escapeHtml(c.mute_reason || '')}"
                data-expires="${c.mute_expires_at === null ? 'null' : (c.mute_expires_at || '')}"
                ${PC_ME && String(PC_ME.id) === String(c.user_id) ? 'disabled' : ''}>
          ${SVG.mute}
        </button>
        <button class="comment-delete" title="Delete" data-id="${c.id}">
          ${SVG.trash}
        </button>
      ` : "" }
    `;

    if (isAdmin) {
      const delBtn = wrapper.querySelector(".comment-delete");
      if (delBtn) {
        delBtn.addEventListener("click", () => {
          const id = delBtn.dataset.id;
          const confirmId = `modal-delConfirm-${id}`;
          const existing = document.getElementById(confirmId);
          if (existing) existing.remove();

          showGlobalModal({
            type: "warning",
            title: "Delete this comment?",
            message: "This action cannot be undone.",
            buttons: [
              { label: "Cancel", onClick: `fadeOutAndRemove('${confirmId}')` },
              { label: "Delete", onClick: `confirmDeleteComment('${id}','${confirmId}')` }
            ],
            id: confirmId
          });
        });
      }

      const muteBtn = wrapper.querySelector(".comment-mute");
      if (muteBtn) {
        muteBtn.addEventListener("click", () => {
          window.openMuteModal({
            userId: Number(muteBtn.dataset.userId),
            userRole: String(muteBtn.dataset.userRole || ""),
            username: muteBtn.dataset.username || "",
            mc: muteBtn.dataset.mc || "",
            active: muteBtn.dataset.active === "1",
            reason: muteBtn.dataset.reason || "",
            expires: muteBtn.dataset.expires || ""
          });
        });
      }
    }

    list.appendChild(wrapper);
  });

  renderCommentPagination(page, totalPages);
}

function renderCommentPagination(page, totalPages) {
  const list = document.getElementById("commentList");
  if (!list) return;

  // Create/fetch a footer INSIDE the list
  let footer = list.querySelector(".pc-pager-wrap");
  if (!footer) {
    footer = document.createElement("div");
    footer.className = "pc-pager-wrap";
    list.appendChild(footer);
  }

  const model = buildPageModel(page, totalPages);
  const prevDisabled = page <= 1 ? "disabled" : "";
  const nextDisabled = page >= totalPages ? "disabled" : "";

  footer.innerHTML = `
    <div class="pc-pager">
      <button class="pc-page-btn" data-page="${page - 1}" ${prevDisabled} aria-label="Previous">‹</button>
      ${model.map(p => {
        if (p === "…") return `<span class="pc-ellipsis">…</span>`;
        const active = p === page ? "active" : "";
        return `<button class="pc-page-btn ${active}" data-page="${p}">${p}</button>`;
      }).join("")}
      <button class="pc-page-btn" data-page="${page + 1}" ${nextDisabled} aria-label="Next">›</button>
    </div>
  `;

  // Click handlers
  footer.querySelectorAll(".pc-page-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = Number(btn.dataset.page);
      if (!Number.isFinite(target) || target < 1 || target > totalPages) return;
      PC_COMMENTS_PAGE = target;
      renderCommentsPaged();
      list.scrollTo({ top: list.scrollHeight, behavior: "smooth" }); // keep footer visible after rebuild
    });
  });
}

const MAX = 250;

document.getElementById("submitComment").onclick = async () => {
  const box = document.getElementById("commentBox");

  // If the mute overlay is present, block locally and show the right message.
  const wrap = box?.closest(".comment-input");
  const hasMuteOverlay = !!wrap?.querySelector(".comment-mute-overlay");
  if (hasMuteOverlay) {
    try {
      const r = await fetch(`${backendUrl}/comment-mute/me`, { credentials: "include" });
      const m = r.ok ? await r.json() : null;
      let msg = "You are muted.";
      if (m?.is_muted) {
        if (m.expires_at === null) {
          msg = "You have been muted indefinitely by Administrators.";
        } else if (m.expires_at) {
          msg = `You are temporarily muted. Unmutes ${new Date(m.expires_at).toLocaleString()}.`;
        }
      }
      showGlobalModal({
        type: "error",
        title: "You’re muted",
        message: escapeHtml(msg),
        buttons: [{ label: "OK", onClick: "fadeOutAndRemove('modal-muteNotice')" }],
        id: "modal-muteNotice"
      });
    } catch {}
    return; // hard stop — do not attempt to post
  }


  const comment = box.value.trim();
  if (!comment) return;
  if (comment.length > MAX) return alert("Comment too long");

  const res = await fetch(`${backendUrl}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      itemId: currentItem.id,
      economy: selectedEconomy,
      comment,
    }),
  });
  const out = await res.json();
  if (res.ok) {
    box.value = "";
    document.getElementById("charCount").textContent = `0/${MAX}`;
    loadComments(currentItem.id);
    await applyCommentMuteGate();
  } else {
    // if backend signals muted (423 or text mentions 'muted'), show modal + enforce gate
    const muted = (res.status === 423) || (String(out?.error || "").toLowerCase().includes("muted"));
    if (muted) {
      // Re-check exact status to decide wording
      let msg = out?.error || "You are temporarily muted.";
      try {
        const r2 = await fetch(`${backendUrl}/comment-mute/me`, { credentials: "include" });
        if (r2.ok) {
          const m = await r2.json();
          if (m?.is_muted) {
            if (m.expires_at === null) {
              msg = "You have been muted indefinitely by Administrators.";
            } else {
              msg = `You are temporarily muted. Mute expires: ${new Date(m.expires_at).toLocaleString()}.`;
            }
          }
        }
      } catch {}

      await applyCommentMuteGate();
      showGlobalModal({
        type: "error",
        title: "You’re muted",
        message: escapeHtml(msg),
        buttons: [{ label: "OK", onClick: "fadeOutAndRemove('modal-muteNotice')" }],
        id: "modal-muteNotice"
      });
    } else {
      showGlobalModal({
        type: "error",
        title: "Unable to post",
        message: (out?.error) ? escapeHtml(out.error) : "Please try again later.",
        buttons: [{ label: "Close", onClick: "fadeOutAndRemove('modal-commentErr')" }],
        id: "modal-commentErr"
      });
    }
  }
};

document.getElementById("commentBox").addEventListener("input", (e) => {
  const n = e.target.value.length;
  document.getElementById("charCount").textContent = `${n}/${MAX}`;
});

// ================== GLOBAL TOOLTIP LOGIC ==================
const globalTooltip = document.getElementById("global-tooltip");

document.addEventListener("mouseover", (e) => {
  const infoIcon = e.target.closest(".info-icon");
  if (!infoIcon) return;

  const tooltipText = infoIcon.getAttribute("data-tooltip");
  if (!tooltipText) return;

  globalTooltip.textContent = tooltipText;
  globalTooltip.style.display = "block";

  const rect = infoIcon.getBoundingClientRect();
  const scrollTop = window.scrollY || document.documentElement.scrollTop;
  const tooltipHeight = globalTooltip.offsetHeight || 40;

  // Default: position above icon, fallback below if too close to top
  let top = rect.top + scrollTop - tooltipHeight - 10;
  if (top < scrollTop + 20) {
    top = rect.bottom + scrollTop + 10;
  }

  globalTooltip.style.top = `${top}px`;
  globalTooltip.style.left = `${rect.left + rect.width / 2}px`;
  globalTooltip.style.transform = "translateX(-50%)";
});

document.addEventListener("mouseout", (e) => {
  const infoIcon = e.target.closest(".info-icon");
  if (infoIcon) {
    globalTooltip.style.display = "none";
  }
});

// ================== COMMUNITY PRICE INSIGHTS ==================

async function loadInsights(itemId){
  try {
    const res = await fetch(`${backendUrl}/price-insights/${itemId}?economy=${encodeURIComponent(selectedEconomy)}`, {
      credentials: 'include'
    });
    if (!res.ok) { renderInsights(null); return; }
    const data = await res.json();
    renderInsights(data);
  } catch {
    renderInsights(null);
  }
}

function renderInsights(i){
  const val   = document.getElementById('insValue');
  const conf  = document.getElementById('insConfidence');
  const rLo   = document.getElementById('insRangeLow');
  const rHi   = document.getElementById('insRangeHigh');
  const reps  = document.getElementById('insReports');
  const upd   = document.getElementById('insUpdated');
  const btn   = document.getElementById('btnReportPrice');

  if (!val || !conf || !rLo || !rHi || !reps || !upd || !btn) return;

  if (!i){
    val.textContent = "Community Price ≈ —";
    conf.textContent = "—";
    conf.className = "badge";
    rLo.textContent = "—"; rHi.textContent = "—";
    reps.textContent = "0";
    upd.textContent = "";
    btn.onclick = guardedOpenReportPriceModal;
    return;
  }

  val.textContent = `Community Price ≈ ${pcFormatCoins(i.predicted)}`;
  conf.textContent = i.confidence || "low";
  conf.className = `badge ${i.confidence || "low"}`;
  rLo.textContent = pcFormatCoins(i.range_low);
  rHi.textContent = pcFormatCoins(i.range_high);
  reps.textContent = i.reports ?? 0;
  upd.textContent = i.last_report_at ? `Last Updated: ${new Date(i.last_report_at).toLocaleString()}` : "Last Updated: Never";

  btn.onclick = guardedOpenReportPriceModal;
}

async function guardedOpenReportPriceModal() {
  if (!PC_ME) {
    try {
      const r = await fetch(`${backendUrl}/me`, { credentials: "include" });
      PC_ME = r.ok ? await r.json() : null;
    } catch {}
  }

  if (!PC_ME || !isLinkedAccount()) {
    showGlobalModal({
      type: "error",
      title: "Sign in & link Minecraft",
      message: "You must be signed into your account and have your Minecraft IGN linked to submit price reports.",
      buttons: [{ label: "OK", onClick: "fadeOutAndRemove('modal-rp-denied')" }],
      id: "modal-rp-denied"
    });
    return;
  }

  openReportPriceModal();
}

function openReportPriceModal(){
  const id = `modal-report-${currentItem?.id}-${selectedEconomy}`;
  showGlobalModal({
    type: 'info',
    title: `Report Price Update: ${selectedEconomy}`,
    message: `<div class="report-wrap">
       <input id="rp-price" style="width: 140%" type="text" inputmode="numeric" pattern="\\d*" placeholder="Enter price (max 8 digits)">
     </div>`,
    id,
    buttons: [
      { label: "Cancel", onClick: `fadeOutAndRemove('${id}')` },
      { label: "Submit", onClick: `submitReportPrice('${id}')` }
    ]
  });

    setTimeout(() => {
    const el = document.getElementById('rp-price');
    if (!el) return;
    el.addEventListener('input', () => {
      el.value = el.value.replace(/\D/g, '').slice(0, 8);
    });
  }, 0);
}

window.submitReportPrice = async (modalId)=>{
  const pEl = document.getElementById('rp-price');
  const raw = (pEl?.value || "").replace(/\D/g, "");
  const price = Number(raw);

  if (!Number.isFinite(price) || price < 1 || price > 99_999_999) {
    // brief inline feedback
    pEl?.classList?.add('shake');
    setTimeout(()=>pEl?.classList?.remove('shake'), 400);
    return;
  }

  const r = await fetch(`${backendUrl}/items/${currentItem.id}/report-price`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ price, economy: selectedEconomy })
  });

  if (typeof fadeOutAndRemove === "function") fadeOutAndRemove(modalId);

  if (r.ok){
    showGlobalModal({
      type: "success",
      title: "Thanks!",
      message: "Your report was recorded.",
      buttons: [{ label: "OK", onClick: "fadeOutAndRemove('modal-rp-ok')" }],
      id: "modal-rp-ok"
    });
    loadInsights(currentItem.id);
  } else {
    const { error } = await r.json().catch(()=>({ error: 'Please try again later.' }));
    showGlobalModal({
      type: "error",
      title: "Unable to submit",
      message: error || "Please try again later.",
      buttons: [{ label: "Close", onClick: "fadeOutAndRemove('modal-rp-err')" }],
      id: "modal-rp-err"
    });
  }
};

// ===== COMMENTS PAGINATION =====
const COMMENTS_PER_PAGE = 5;
let PC_COMMENTS_CACHE = [];
let PC_COMMENTS_PAGE  = 1;

function paginate(arr, page, perPage) {
  const total = arr.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const p = Math.min(Math.max(1, page), totalPages);
  const start = (p - 1) * perPage;
  return {
    slice: arr.slice(start, start + perPage),
    page: p,
    total,
    totalPages,
  };
}

/**
 * Build a compact list of page numbers with ellipses.
 * Always includes 1 and totalPages; shows window around current page.
 */
function buildPageModel(page, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const windowPages = new Set([
    1,
    2,
    page - 1, page, page + 1,
    totalPages - 1,
    totalPages
  ].filter(x => x >= 1 && x <= totalPages));

  const sorted = Array.from(windowPages).sort((a,b)=>a-b);
  const out = [];
  for (let i = 0; i < sorted.length; i++) {
    out.push(sorted[i]);
    if (i < sorted.length - 1 && sorted[i+1] !== sorted[i] + 1) {
      out.push("…"); // gap marker
    }
  }
  return out;
}

// ================== DELETE COMMENT (ADMIN ONLY) ==================

window.confirmDeleteComment = async (commentId, modalId) => {
  if (typeof fadeOutAndRemove === "function") fadeOutAndRemove(modalId);

  const res = await fetch(`${backendUrl}/admin/comments/${commentId}`, {
    method: "DELETE",
    credentials: "include"
  });

  if (res.ok) {
    PC_COMMENTS_CACHE = PC_COMMENTS_CACHE.filter(c => String(c.id) !== String(commentId));

    const totalPages = Math.max(1, Math.ceil(PC_COMMENTS_CACHE.length / COMMENTS_PER_PAGE));
    if (PC_COMMENTS_PAGE > totalPages) PC_COMMENTS_PAGE = totalPages;

    renderCommentsPaged();

    showGlobalModal({
      type: "success",
      title: "Deleted",
      message: "The comment was removed.",
      buttons: [{ label: "OK", onClick: "fadeOutAndRemove('modal-delSuccess')" }],
      id: "modal-delSuccess"
    });
    return;
  }

  // Error modal
  showGlobalModal({
    type: "error",
    title: "Deletion failed",
    message: "Could not delete comment. Try again later.",
    buttons: [{ label: "Close", onClick: "fadeOutAndRemove('modal-delFail')" }],
    id: "modal-delFail"
  });
};

// ================== PRICE EDIT MODAL (ADMIN ONLY) ==================
function openPriceEditModal(field) {
  const { base, max } = getCurrentEconomyValues();
  const currentVal = field === "base" ? base : max;
  const title = field === "base" ? "Edit Min (Base)" : "Edit Max";

  // overlay
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position:fixed; inset:0; display:grid; place-items:center; z-index:9999;
    background:rgba(0,0,0,.55);
    opacity:0; transition:opacity .18s ease;
  `;

  // card
  const card = document.createElement("div");
  card.style.cssText = `
    width:360px; max-width:calc(100vw - 32px);
    background:#0c0c1a; color:#e7e9f3; border:1px solid #22233a;
    border-radius:12px; padding:16px;
    opacity:0; transform:scale(.98);
    transition: opacity .18s ease, transform .18s ease;
  `;
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <div style="font-weight:700;">${title} — ${selectedEconomy}</div>
      <button type="button" aria-label="Close"
              style="background:transparent;border:0;color:#cfd3ff;font-size:20px;cursor:pointer;transition:color .15s">
        ×
      </button>
    </div>
    <div style="margin-top:12px;font-size:.9rem;opacity:.85;text-align:center">
      Enter a whole number (max 8 digits).
    </div>
    <input id="peVal" type="text" inputmode="numeric" autocomplete="off" spellcheck="false"
           value="${Number.isFinite(currentVal) ? currentVal : ""}"
           style="margin:14px auto 0 auto; display:block; width:86%;
                  padding:10px;border-radius:8px;border:1px solid #2c3146;
                  background:#1f2332;color:#e7e9f3; text-align:center" />
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
      <button type="button" id="peCancel"
              style="background:#22233a;border:0;border-radius:6px;color:#fff;
                     padding:8px 14px;cursor:pointer;transition:background-color .15s,color .15s">Cancel</button>
      <button type="button" id="peSave"
              style="background:#365cf5;border:0;border-radius:6px;color:#fff;
                     padding:8px 14px;cursor:pointer;transition:background-color .15s,color .15s">Save</button>
    </div>
  `;
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  // fade in
  requestAnimationFrame(() => {
    overlay.style.opacity = "1";
    card.style.opacity = "1";
    card.style.transform = "scale(1)";
  });

  const closeAnimated = () => {
    overlay.style.opacity = "0";
    card.style.opacity = "0";
    card.style.transform = "scale(.98)";
    setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 200);
  };

  // interactions
  const closeBtn   = card.querySelector("[aria-label='Close']");
  const cancelBtn  = card.querySelector("#peCancel");
  const saveBtn    = card.querySelector("#peSave");
  const input      = card.querySelector("#peVal");

  closeBtn.onclick  = closeAnimated;
  cancelBtn.onclick = closeAnimated;

  // subtle button hover transitions
  closeBtn.addEventListener("mouseenter", () => closeBtn.style.color = "#ffffff");
  closeBtn.addEventListener("mouseleave", () => closeBtn.style.color = "#cfd3ff");
  cancelBtn.addEventListener("mouseenter", () => cancelBtn.style.backgroundColor = "#2a2d46");
  cancelBtn.addEventListener("mouseleave", () => cancelBtn.style.backgroundColor = "#22233a");
  saveBtn.addEventListener("mouseenter", () => saveBtn.style.backgroundColor = "#2d51ed");
  saveBtn.addEventListener("mouseleave", () => saveBtn.style.backgroundColor = "#365cf5");

  input.focus(); input.select();
  input.addEventListener("input", () => { input.value = input.value.replace(/\D+/g, "").slice(0, 8); });

  saveBtn.onclick = async () => {
    const raw = (input.value || "").trim();
    if (!raw) {
      showGlobalModal({
        type: "error",
        title: "Invalid value",
        message: "Please enter a number.",
        buttons: [{ label: "OK", onClick: "fadeOutAndRemove('modal-pe-invalid')" }],
        id: "modal-pe-invalid"
      });
      return;
    }
    const val = Number(raw);
    if (!Number.isFinite(val) || val < 0 || val > 99999999) {
      showGlobalModal({
        type: "error",
        title: "Out of range",
        message: "Must be between 0 and 99,999,999.",
        buttons: [{ label: "OK", onClick: "fadeOutAndRemove('modal-pe-range')" }],
        id: "modal-pe-range"
      });
      return;
    }

    const cur = getCurrentEconomyValues();
    const payload = {
      economy: selectedEconomy,
      base: field === "base" ? val : cur.base,
      max:  field === "max"  ? val : cur.max
    };
    if (payload.base > payload.max) {
      showGlobalModal({
        type: "error",
        title: "Invalid range",
        message: "Min (Base) cannot be greater than Max.",
        buttons: [{ label: "OK", onClick: "fadeOutAndRemove('modal-pe-range2')" }],
        id: "modal-pe-range2"
      });
      return;
    }

    try {
      const r = await fetch(`${backendUrl}/admin/prices/${currentItem.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!r.ok) {
        const e = await r.json().catch(()=>({ error:"Failed to update." }));
        showGlobalModal({
          type: "error",
          title: "Update failed",
          message: e.error || "Failed to update.",
          buttons: [{ label: "Close", onClick: "fadeOutAndRemove('modal-pe-fail')" }],
          id: "modal-pe-fail"
        });
        return;
      }

      // reflect the change locally so UI updates immediately
      if (selectedEconomy === "Phoenix") {
        if (field === "base") currentItem.px_base_value = payload.base; else currentItem.px_max_value = payload.max;
      } else if (selectedEconomy === "Lynx") {
        if (field === "base") currentItem.lx_base_value = payload.base; else currentItem.lx_max_value = payload.max;
      } else if (selectedEconomy === "Wyvern") {
        if (field === "base") currentItem.wyv_base_value = payload.base; else currentItem.wyv_max_value = payload.max;
      } else if (selectedEconomy === "Cerberus") {
        if (field === "base") currentItem.cb_base_value = payload.base; else currentItem.cb_max_value = payload.max;
      }

      updateEconomyDisplay();          // updates Min/Max/Avg
      loadInsights(currentItem.id);    // optional refresh of community card

      showGlobalModal({
        type: "success",
        title: "Price updated",
        message: `${title} saved successfully.`,
        buttons: [{ label: "OK", onClick: "fadeOutAndRemove('modal-pe-ok')" }],
        id: "modal-pe-ok"
      });

      closeAnimated();
    } catch (err) {
      console.error(err);
      showGlobalModal({
        type: "error",
        title: "Network error",
        message: "Could not update price.",
        buttons: [{ label: "Close", onClick: "fadeOutAndRemove('modal-pe-net')" }],
        id: "modal-pe-net"
      });
    }
  };
}

// ===== MUTE MODAL HANDLERS (Admin/SysAdmin only) =====
window.openMuteModal = function ({ userId, userRole, username, mc, active, reason, expires }) {
  if (!PC_ME || !["Admin","SysAdmin"].includes(PC_ME.role)) return;

  if (PC_ME.role === "Admin" && userRole === "SysAdmin") {
    showGlobalModal({
      type: "error",
      title: "Insufficient permissions",
      message: "Admins cannot mute SysAdmins.",
      buttons: [{ label: "Close", onClick: "fadeOutAndRemove('modal-muteDenied')" }],
      id: "modal-muteDenied"
    });
    return;
  }

  const id = `modal-mute-${userId}`;
  const existing = document.getElementById(id);
  if (existing) existing.remove();

  const mcPretty = mc ? mc : "—";
  const expiresAt = expires ? new Date(expires) : null;
  const indefinite = active && expires === "null";

  const infoTop = `
    <div class="mute-row" style="margin-top:4px">
      <div><b>Username:</b> ${escapeHtml(username)}</div>
      <div><b>Linked Minecraft account:</b> ${escapeHtml(mcPretty)}</div>
    </div>
  `;

  const activeBlock = !active ? "" : `
    <div class="mute-row"><em>This user is currently muted.</em></div>
    ${reason ? `<div class="mute-row"><b>Reason:</b> ${escapeHtml(reason)}</div>` : ""}
    ${indefinite ? `<div class="mute-row"><b>Duration:</b> Indefinitely</div>`
                  : `<div class="mute-row"><b>Mute expiration:</b> ${expiresAt.toLocaleString()}</div>`}
  `;

  const body = `
    <div class="mute-modal">
      ${infoTop}
      ${activeBlock}
      <div class="mute-row"><label>${active ? "New duration" : "Duration"}</label>
        <select id="mute-duration">
          <option value="1h">1 hour</option>
          <option value="24h">24 hours</option>
          <option value="indefinite">Indefinitely</option>
        </select>
      </div>
      <div class="mute-row"><label>Reason</label>
        <textarea id="mute-reason" rows="3" placeholder="Optional reason"></textarea>
      </div>
    </div>
  `;

  const buttons = active
    ? [
        { label: "Unmute", onClick: `unmuteUser(${userId}, '${id}')` },
        { label: "Apply",  onClick: `muteUser(${userId}, '${id}')` }
      ]
    : [
        { label: "Cancel", onClick: `fadeOutAndRemove('${id}')` },
        { label: "Mute",   onClick: `muteUser(${userId}, '${id}')` }
      ];

  showGlobalModal({
    type: "info",
    title: `Mute Options for: ${escapeHtml(username)}`,
    message: body,
    buttons,
    id
  });
};

window.muteUser = async function (userId, modalId) {
  const sel = document.getElementById("mute-duration");
  const reasonEl = document.getElementById("mute-reason");
  const duration = sel ? sel.value : "24h";
  const reason = (reasonEl?.value || "").trim();

  const res = await fetch(`${backendUrl}/admin/comment-mute`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ userId, duration, reason })
  });

  if (res.ok) {
    if (typeof fadeOutAndRemove === "function") fadeOutAndRemove(modalId);
    // refresh current comments to reflect new badge
    if (currentItem?.id) loadComments(currentItem.id);
    showGlobalModal({
      type: "success",
      title: "Muted",
      message: "User mute updated.",
      buttons: [{ label: "OK", onClick: "fadeOutAndRemove('modal-muteSuccess')" }],
      id: "modal-muteSuccess"
    });
  } else {
    const data = await res.json().catch(()=>({}));
    showGlobalModal({
      type: "error",
      title: "Failed",
      message: data.error || "Could not mute user.",
      buttons: [{ label: "Close", onClick: "fadeOutAndRemove('modal-muteErr')" }],
      id: "modal-muteErr"
    });
  }
};

window.unmuteUser = async function (userId, modalId) {
  const res = await fetch(`${backendUrl}/admin/comment-mute/${userId}`, {
    method: "DELETE",
    credentials: "include"
  });
  if (res.ok) {
    if (typeof fadeOutAndRemove === "function") fadeOutAndRemove(modalId);
    if (currentItem?.id) loadComments(currentItem.id);
    showGlobalModal({
      type: "success",
      title: "Unmuted",
      message: "User has been unmuted.",
      buttons: [{ label: "OK", onClick: "fadeOutAndRemove('modal-unmuteSuccess')" }],
      id: "modal-unmuteSuccess"
    });
  } else {
    const data = await res.json().catch(()=>({}));
    showGlobalModal({
      type: "error",
      title: "Failed",
      message: data.error || "Could not unmute user.",
      buttons: [{ label: "Close", onClick: "fadeOutAndRemove('modal-unmuteErr')" }],
      id: "modal-unmuteErr"
    });
  }
};
