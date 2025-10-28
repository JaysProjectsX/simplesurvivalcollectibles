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

function isLinkedAccount() {
  return !!(PC_ME && typeof PC_ME.minecraft_username === "string" && PC_ME.minecraft_username.trim());
}

function updateCommentGateUI() {
  const box = document.getElementById("commentBox");
  const btn = document.getElementById("submitComment");
  const wrap = box?.closest('.comment-input');
  if (!box || !btn || !wrap) return;

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
  } else if (ov) {
    ov.remove();
  }
}

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
  updateCommentGateUI();

  modal.classList.remove("hidden");
  requestAnimationFrame(() => modal.classList.add("show"));

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
  const base = document.getElementById("baseValue");
  const max = document.getElementById("maxValue");
  const avg = document.getElementById("avgValue");
  const it = currentItem || {};
  let baseVal, maxVal;

  switch (selectedEconomy) {
    case "Phoenix":
      [baseVal, maxVal] = [it.px_base_value, it.px_max_value];
      break;
    case "Lynx":
      [baseVal, maxVal] = [it.lx_base_value, it.lx_max_value];
      break;
    case "Wyvern":
      [baseVal, maxVal] = [it.wyv_base_value, it.wyv_max_value];
      break;
    case "Cerberus":
      [baseVal, maxVal] = [it.cb_base_value, it.cb_max_value];
      break;
  }

  base.textContent = baseVal ?? "—";
  max.textContent = maxVal ?? "—";
  avg.textContent =
    baseVal && maxVal ? ((+baseVal + +maxVal) / 2).toFixed(2) : "—";
  highlightEconomy();
}

function highlightEconomy() {
  document.querySelectorAll(".econ-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.econ === selectedEconomy);
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
  `
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

    const ignSpan = c.minecraft_username
      ? `<span class="mc-tag">IGN: ${escapeHtml(c.minecraft_username)} ${SVG.verify}</span>`
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
        <!-- your existing trash (unchanged class & styling) -->
        <button class="comment-delete" title="Delete" data-id="${c.id}">
          ${SVG.trash}
        </button>

        <button class="comment-mute-btn"
                title="${isMutedAuthor ? 'View/Update mute' : 'Mute user'}"
                data-user-id="${c.user_id}"
                data-username="${escapeHtml(c.username)}"
                data-ign="${escapeHtml(c.minecraft_username || '')}"
                data-expires="${c.mute_expires_at || ''}"
                data-reason="${escapeHtml(c.mute_reason || '')}"
                data-role="${escapeHtml(c.user_role || '')}">
          ${SVG.mute}
        </button>
      ` : "" }
    `;

    if (isAdmin) {
      const delBtn = wrapper.querySelector(".comment-delete");
      if (delBtn) {
        delBtn.addEventListener("click", () => {
          const id = delBtn.dataset.id;
          const confirmId = `modal-delConfirm-${id}`;
          document.getElementById(confirmId)?.remove();
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

      // MUTE modal open
      const muteBtn = wrapper.querySelector(".comment-mute-btn");
      if (muteBtn) {
        muteBtn.addEventListener("click", () => {
          const viewerRole = (PC_ME && PC_ME.role) || "User";
          const targetRole = muteBtn.dataset.role || "";

          // Block Admins from muting SysAdmins
          if (viewerRole === "Admin" && targetRole === "SysAdmin") {
            const denyId = `modal-muteDenied-${c.user_id}`;
            document.getElementById(denyId)?.remove();
            showGlobalModal({
              type: "error",
              title: "Action not allowed",
              message: "Admins cannot mute SysAdmins.",
              buttons: [{ label: "Close", onClick: `fadeOutAndRemove('${denyId}')` }],
              id: denyId
            });
            return;
          }

          // Proceed as normal
          const userId   = muteBtn.dataset.userId;
          const username = muteBtn.dataset.username;
          const ign      = muteBtn.dataset.ign || "";
          const expires  = muteBtn.dataset.expires || "";
          const reason   = muteBtn.dataset.reason || "";
          openMuteModal({ userId, username, ign, expires, reason });
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
  } else {
    alert(out.error || "Failed to post comment");
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