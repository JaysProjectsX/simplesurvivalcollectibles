const collectionsContainer = document.getElementById("collectionsContainer");
const modal = document.getElementById("crateModal");
const modalTitle = document.getElementById("crateTitle");
const modalTable = document.getElementById("crateItemsTableBody");

const modalContentEl = document.getElementById("crateModalContent");
const accordionContainer = document.getElementById("accordionContainer");
let openCrateId = null; // track which crate is open

let userProgress = {}; // fetched per user
const backendUrl2 = "https://simplesurvivalcollectibles.site";

// Fetch crates and their items
async function fetchCratesWithItems() {
  const res = await fetch(`${backendUrl2}/api/crates`);
  const crates = await res.json();

  const cratesWithItems = await Promise.all(
    crates.map(async (crate) => {
      const itemRes = await fetch(`${backendUrl2}/api/crates/${crate.id}/items`);
      const items = await itemRes.json();

      return {
        id: crate.id,
        name: crate.crate_name,
        items
      };
    })
  );

  return cratesWithItems;
}

async function silentRepairSession() {
  // Ping /me to refresh/validate session using refresh cookie
  try {
    const res = await fetch(`${backendUrl2}/me`, {
      credentials: "include"
    });
    return res.ok; // true if session is good now
  } catch {
    return false;
  }
}

// Fetch per-user progress
// Fetch per-user progress (401 -> try /me silently, then retry once)
async function fetchUserProgress() {
  const tryFetch = () =>
    fetch(`${backendUrl2}/api/user/progress`, {
      credentials: "include"
    });

  try {
    let res = await tryFetch();

    if (res.status === 401) {
      // attempt silent repair
      const repaired = await silentRepairSession();
      if (repaired) {
        res = await tryFetch(); // retry once after repair
      }
    }

    if (!res.ok) {
      if (res.status === 401) {
        // truly unauthorized after repair → redirect (don’t nuke the body)
        document.getElementById("preloader").style.display = "none";
        window.location.replace("/?redirectReason=sessionExpired");
        throw new Error("Unauthorized after silent repair");
      }
      throw new Error(`HTTP error! Status: ${res.status}`);
    }

    userProgress = await res.json();
  } catch (err) {
    console.error("Error fetching user progress:", err);
    throw err; // keep caller behavior
  }
}


// Determine progress bar percentage and tag class
function calculateProgress(crateId, itemCount) {
  const collected = userProgress[crateId]?.items?.length || 0;
  const percent = Math.round((collected / itemCount) * 100);

  let tagClass = "tag-not-started";
  if (percent === 100) tagClass = "tag-complete";
  else if (percent > 0) tagClass = "tag-incomplete";

  return { percent, tagClass };
}

// Utility to format crate names
function formatCrateName(rawName) {
  return rawName
    .replace(/([a-z])([A-Z])/g, '$1 $2') // split camelCase
    .replace(/_/g, ' ') // replace underscores with space
    .replace(/\b\w/g, char => char.toUpperCase()); // capitalize first letter of each word
}

// Render cards for each crate
function renderCrates(crates) {
  collectionsContainer.innerHTML = ""; // clear before rendering

  crates.forEach(crate => {
    const { percent, tagClass } = calculateProgress(crate.id, crate.items.length);
    const lastSaved = userProgress[crate.id]?.updatedAt || "Never";

    const collectedCount = userProgress[crate.id]?.items?.length || 0;
    const totalCount = crate.items.length;

    const card = document.createElement("div");
    card.className = "crate-card";

    // Set the bottom border color based on tagClass
    let borderColor;
    if (tagClass === "tag-complete") borderColor = "rgb(66, 210, 157)"; // green
    else if (tagClass === "tag-incomplete") borderColor = "#f7c800"; // yellow
    else borderColor = "rgb(250, 90, 120)"; // red
    card.style.borderBottom = `3px solid ${borderColor}`;

    card.innerHTML = `
      <div class="card-tag ${tagClass}">
        ${tagClass === "tag-complete" ? "Completed" : tagClass === "tag-incomplete" ? "Incomplete" : "Not Started"}
      </div>
      <h3>${formatCrateName(crate.name)}</h3>
      <div class="progress-bar-container">
        <div class="progress-bar-fill" style="width: ${percent}%">${percent}%</div>
      </div>
      <div class="crate-date">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style="vertical-align: middle; margin-right: 5px;">
          <path d="M12 1a11 11 0 1 0 11 11A11.013 11.013 0 0 0 12 1Zm0 20a9 9 0 1 1 9-9a9.01 9.01 0 0 1-9 9Zm.5-9.793V7a1 1 0 0 0-2 0v5a1 1 0 0 0 .293.707l3.5 3.5a1 1 0 0 0 1.414-1.414Z"/>
        </svg>
        ${lastSaved !== "Never" ? new Date(lastSaved).toLocaleDateString() : "Never"}
      </div>
      <div class="crate-count">${collectedCount}/${totalCount} items</div>
    `;

    card.addEventListener("click", () => openCrateModal(crate));
    collectionsContainer.appendChild(card);
  });
}


// state for search/filter and single-open accordion
let currentFilter = "default";
let currentSearch = "";
let currentlyOpenPanel = null; // only one open at a time

function openCrateModal(crate) {
  openCrateId = crate.id;
  modalTitle.textContent = formatCrateName(crate.name);

  // wire up controls
  const searchInput = document.getElementById("crateSearch");
  const filterSel   = document.getElementById("crateFilter");

  // hydrate with last used values
  searchInput.value = currentSearch;
  filterSel.value = currentFilter;

  // render everything once
  renderAccordion(crate);

  // listeners (debounced search)
  let tId;
  searchInput.oninput = () => {
    currentSearch = searchInput.value.trim().toLowerCase();
    clearTimeout(tId);
    tId = setTimeout(() => {
      renderAccordion(crate, /*keepOpen*/true);
      if (currentSearch) focusFirstSearchHit();
    }, 120);
  };

  filterSel.onchange = () => {
    currentFilter = filterSel.value;
    renderAccordion(crate, /*keepOpen*/true);
  };

  modal.classList.add("show");
}

/** Render the grouped accordions with the current filter/search settings */
function renderAccordion(crate, keepOpen = false) {
  // Group items by set_name
  const groups = crate.items.reduce((acc, item) => {
    const key = item.set_name || "Unknown";
    (acc[key] ||= []).push(item);
    return acc;
  }, {});

  // Sort group names A→Z
  const groupNames = Object.keys(groups).sort((a,b) => a.localeCompare(b));

  accordionContainer.innerHTML = "";
  const previouslyOpenId = keepOpen && currentlyOpenPanel?.dataset.groupId;

  groupNames.forEach((groupName) => {
    // base sort: A-Z by item_name
    let items = groups[groupName].slice().sort((a,b)=>a.item_name.localeCompare(b.item_name));

    // apply filter modes
    if (currentFilter === "missing-only") {
      items = items.filter(it => !userProgress[crate.id]?.items?.includes(it.id));
    } else if (currentFilter === "missing-first") {
      items.sort((a,b) => {
        const aChecked = userProgress[crate.id]?.items?.includes(a.id) ? 1 : 0;
        const bChecked = userProgress[crate.id]?.items?.includes(b.id) ? 1 : 0;
        return aChecked - bChecked || a.item_name.localeCompare(b.item_name);
      });
    }

    // apply search term (soft filter: keep all, but we’ll highlight & jump;
    // if you'd rather hide non-matches, uncomment the filter below)
    const term = currentSearch;
    // if (term) items = items.filter(it => it.item_name.toLowerCase().includes(term));

    const accItem = document.createElement("div");
    accItem.className = "acc-item";

    const btn = document.createElement("button");
    btn.className = "acc-btn";
    btn.setAttribute("type", "button");

    // counts use original (unfiltered) group totals to show collection status
    const totalInGroup   = groups[groupName].length;
    const checkedInGroup = groups[groupName].filter(it =>
      userProgress[crate.id]?.items?.includes(it.id)
    ).length;

    btn.innerHTML = `
      <span class="acc-title">${groupName}</span>
      <span class="acc-count">Total items collected: ${checkedInGroup}/${totalInGroup}</span>
      <button class="set-select-btn" type="button">Select set</button>
      <span class="acc-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
      </span>
    `;

    const panel = document.createElement("div");
    panel.className = "acc-panel";
    panel.dataset.groupId = groupName;  // for restoring open state
    const inner = document.createElement("div");
    inner.className = "acc-panel-inner";

    // build table
    const table = document.createElement("table");
    table.className = "acc-table";
    table.innerHTML = `
      <thead>
        <tr>
          <th>Item Name</th>
          <th>Item Set</th>
          <th>Icon</th>
          <th>Collected</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector("tbody");

    items.forEach(item => {
      const isChecked = userProgress[crate.id]?.items?.includes(item.id);
      const match = term && item.item_name.toLowerCase().includes(term);
      const tr = document.createElement("tr");
      tr.dataset.itemId = item.id;
      tr.dataset.groupId = groupName;
      tr.innerHTML = `
        <td>${item.item_name}</td>
        <td>${item.set_name || ""}</td>
        <td><img src="${item.icon_url}" alt="${item.item_name}"></td>
        <td><input type="checkbox"
                   data-crate-id="${crate.id}"
                   data-item-id="${item.id}"
                   ${isChecked ? "checked" : ""}></td>
      `;
      if (match) tr.classList.add("highlight-row");
      tbody.appendChild(tr);
    });

    inner.appendChild(table);
    panel.appendChild(inner);

    // only-one-open behavior
    btn.addEventListener("click", () => toggleAccordion(btn, panel));

    // "Select set" button
    btn.querySelector(".set-select-btn").addEventListener("click", (ev) => {
      ev.stopPropagation(); // don’t toggle accordion
      panel.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
    });

    // restore previously opened panel if requested
    if (!currentSearch && previouslyOpenId && previouslyOpenId === groupName) {
      openPanel(btn, panel);
    }

    accItem.appendChild(btn);
    accItem.appendChild(panel);
    accordionContainer.appendChild(accItem);
  });

  // if we searched, jump to first hit (after DOM exists)
  if (currentSearch) focusFirstSearchHit();
}

/* toggle helpers */
function openPanel(btn, panel){
  document.querySelectorAll(".acc-panel.open").forEach(p => {
    if (p !== panel) {
      p.classList.remove("open");
      p.style.maxHeight = null;
      const hdr = p.previousElementSibling;
      if (hdr) hdr.classList.remove("active");
    }
  });

  panel.classList.add("open");
  panel.style.maxHeight = panel.scrollHeight + "px";
  btn.classList.add("active");
  currentlyOpenPanel = panel;
}

function toggleAccordion(btn, panel){
  const isOpen = panel.classList.contains("open");
  if (isOpen){
    panel.classList.remove("open");
    panel.style.maxHeight = null;
    btn.classList.remove("active");
    currentlyOpenPanel = null;
  } else {
    openPanel(btn, panel);
  }
}


/* search: focus first matching row, ensure its panel is open, and highlight */
function focusFirstSearchHit(){
  const hit = accordionContainer.querySelector("tr.highlight-row");
  if (!hit) return;

  const panel = hit.closest(".acc-panel");
  if (!panel) return;

  const btn = panel.previousElementSibling; // header button
  if (!panel.classList.contains("open")) openPanel(btn, panel);

  // scroll after layout is ready so maxHeight reflects content
  requestAnimationFrame(() => {
    hit.scrollIntoView({ behavior: "smooth", block: "center" });
    hit.classList.add("pulse");
    setTimeout(() => hit.classList.remove("pulse"), 900);
  });
}





function closeModal() {
  modal.classList.remove("show");
}

// Initialize the page
(async () => {
  await fetchUserProgress();
  const crates = await fetchCratesWithItems();
  collectionsContainer.innerHTML = "";
  renderCrates(crates);
  document.getElementById("preloader").style.display = "none";
})();

// Modal save/cancel buttons
const saveButton = document.getElementById("saveProgressBtn");
const cancelButton = document.getElementById("cancelProgressBtn");
const selectAllBtn = document.getElementById("selectAllBtn");

selectAllBtn.addEventListener("click", () => {
  const checkboxes = modalContentEl.querySelectorAll("input[type='checkbox']");
  checkboxes.forEach(cb => { cb.checked = true; });
});

saveButton.addEventListener("click", async () => {
  document.getElementById("modalSavingOverlay").style.display = "flex";

  const checkboxes = modalContentEl.querySelectorAll("input[type='checkbox']");
  const savePromises = [];

  for (const checkbox of checkboxes) {
    const crateId = checkbox.dataset.crateId;
    const itemId = checkbox.dataset.itemId;
    const checked = checkbox.checked;

    savePromises.push(
      fetch(`${backendUrl2}/api/user/progress`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crateId, itemId, checked }),
      })
    );
  }

  await Promise.all(savePromises);

  // Refresh userProgress and crate data once
  await fetchUserProgress();
  const allCrates = await fetchCratesWithItems();

  // Update the specific crate card in real-time
  const crateId = checkboxes[0]?.dataset.crateId;
  if (crateId) {
    const crateData = allCrates.find(c => c.id == crateId);
    const crateCard = [...document.querySelectorAll(".crate-card")]
      .find(card => card.querySelector("h3").textContent === formatCrateName(crateData.name));

    if (crateCard) {
      const { percent, tagClass } = calculateProgress(crateId, crateData.items.length);

      // Update tag
      const tagEl = crateCard.querySelector(".card-tag");
      tagEl.className = `card-tag ${tagClass}`;
      tagEl.textContent =
        tagClass === "tag-complete" ? "Completed" :
        tagClass === "tag-incomplete" ? "Incomplete" : "Not Started";

      // Update progress bar
      const progressFill = crateCard.querySelector(".progress-bar-fill");
      progressFill.style.width = `${percent}%`;
      progressFill.textContent = `${percent}%`;

      // Update last saved date
      const dateEl = crateCard.querySelector(".crate-date");
      dateEl.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style="vertical-align: middle; margin-right: 5px;">
          <path d="M12 1a11 11 0 1 0 11 11A11.013 11.013 0 0 0 12 1Zm0 20a9 9 0 1 1 9-9a9.01 9.01 0 0 1-9 9Zm.5-9.793V7a1 1 0 0 0-2 0v5a1 1 0 0 0 .293.707l3.5 3.5a1 1 0 0 0 1.414-1.414Z"/>
        </svg>
        ${new Date(userProgress[crateId]?.updatedAt || Date.now()).toLocaleDateString()}
      `;

      // Update collected count
      const collectedCount = userProgress[crateId]?.items?.length || 0;
      crateCard.querySelector(".crate-count").textContent =
        `${collectedCount}/${crateData.items.length} items`;

      // Update border color
      let borderColor;
      if (tagClass === "tag-complete") borderColor = "rgb(66, 210, 157)";
      else if (tagClass === "tag-incomplete") borderColor = "#f7c800";
      else borderColor = "rgb(250, 90, 120)";
      crateCard.style.borderBottom = `3px solid ${borderColor}`;
    }
  }

  // Hide overlay & modal
  document.getElementById("modalSavingOverlay").style.display = "none";
  closeModal();
});

cancelButton.addEventListener("click", async () => {
  modal.classList.remove("show");
  await fetchUserProgress();
  const crates = await fetchCratesWithItems();
  collectionsContainer.innerHTML = "";
  renderCrates(crates);
});
