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

function updateCommentGateUI() {
  const box = document.getElementById("commentBox");
  const btn = document.getElementById("submitComment");
  if (!box || !btn) return;

  const linked = !!(PC_ME && typeof PC_ME.minecraft_username === "string" && PC_ME.minecraft_username.trim());

  box.disabled = !linked;
  btn.disabled = !linked;

  // Optional helper text
  const section = document.getElementById("commentSection");
  if (section) {
    let gate = document.getElementById("commentGateMsg");
    if (!gate) {
      gate = document.createElement("div");
      gate.id = "commentGateMsg";
      gate.style.marginTop = "6px";
      gate.style.color = "#a9b3d6";
      section.appendChild(gate);
    }
    gate.innerHTML = linked ? "" : `You must <b>link your Minecraft account</b> to comment.`;
    if (linked) gate.remove();
  }
}

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
    if (currentItem?.id) loadComments(currentItem.id);
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
async function loadComments(itemId) {
  const res = await fetch(`${backendUrl}/comments?itemId=${itemId}`, { credentials: "include" });
  const comments = await res.json();
  const list = document.getElementById("commentList");
  list.innerHTML = "";

  if (!comments.length) {
    list.innerHTML = "<p>No comments yet.</p>";
    return;
  }

  const isAdmin = !!(PC_ME && (PC_ME.role === "Admin" || PC_ME.role === "SysAdmin"));

  comments.forEach(c => {
    const wrapper = document.createElement("div");
    wrapper.className = "comment-entry";

    const date = new Date(c.created_at);
    const timestamp = date.toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit"
    });

    // verified badge if linked
    const verified = c.minecraft_username
      ? `<i class="fa-solid fa-badge-check v-badge" title="Linked account"></i>`
      : "";

    wrapper.innerHTML = `
      <div class="comment-line">
        <b>${escapeHtml(c.username)}</b>
        ${verified}
        ${c.minecraft_username ? `<span class="mc-tag">IGN: ${escapeHtml(c.minecraft_username)}</span>` : ""}
        <span class="econ-tag econ-${c.economy.toLowerCase()}">${escapeHtml(c.economy)}</span>
        <span class="comment-text">: ${escapeHtml(c.comment)}</span>
      </div>
      <small>${timestamp}</small>
      ${isAdmin ? `
        <button class="comment-delete" title="Delete" data-id="${c.id}">
          <i class="fa-solid fa-trash"></i>
        </button>` : ""}
    `;

    if (isAdmin) {
      wrapper.querySelector(".comment-delete").addEventListener("click", async (e) => {
        const id = e.currentTarget.dataset.id;
        if (!confirm("Delete this comment?")) return;
        const delRes = await fetch(`${backendUrl}/comments/${id}`, {
          method: "DELETE",
          credentials: "include"
        });
        if (delRes.ok) {
          loadComments(itemId);
        } else {
          showGlobalModal({
            type: "error",
            title: "Deletion failed",
            message: "Could not delete comment. Try again later.",
            buttons: [{ label: "Close", onClick: "fadeOutAndRemove('modal-delFail')" }],
            id: "modal-delFail"
          });
        }
      });
    }

    list.appendChild(wrapper);
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
